const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const ejs = require('ejs');
const rbac = require('../config/rbac');
const dateBr = require('../utils/data-hora-br');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pcm-agenda-demandas-'));
process.env.DB_PATH = path.join(directory, 'test.sqlite');
const db = require('../database/db');
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY,name TEXT,role TEXT,funcao TEXT,ativo INTEGER DEFAULT 1,archived_at TEXT);
  CREATE TABLE equipamentos (id INTEGER PRIMARY KEY,nome TEXT,setor TEXT);
  CREATE TABLE os (id INTEGER PRIMARY KEY,equipamento TEXT,equipamento_id INTEGER,status TEXT,prioridade TEXT,grau TEXT,tipo TEXT,descricao TEXT,opened_at TEXT,closed_at TEXT);
  INSERT INTO equipamentos VALUES(1,'Equipamento de teste','Produção');
`);
const tableExists = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const columnExists = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column);
const addColumnIfMissing = (table, column, definition) => { if (!columnExists(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`); };
const migrationArgs = { db, tableExists, columnExists, addColumnIfMissing };
db.exec(fs.readFileSync(path.join(__dirname, '../database/migrations/087_demandas.sql'), 'utf8'));
require('../database/migrations/160_os_chat_por_os').up(migrationArgs);
require('../database/migrations/185_pcm_operacional_real')(migrationArgs);
require('../database/migrations/188_demandas_planejamento_integrado')(migrationArgs);
const migrate = require('../database/migrations/247_pcm_agenda_demandas');
migrate(migrationArgs);
const roles = ['ADMIN','MECANICO','ALMOXARIFADO','DIRETORIA','ENCARREGADO_PRODUCAO','RH','COMPRAS','PCM','COLABORADOR','INSPECAO_QUALIDADE','COORDENADOR_RECICLAGEM','MANUTENCAO_SUPERVISOR','ENCARREGADO_MANUTENCAO','ENCARREGADO_FRIGORIFICO','ENCARREGADO_LOGISTICA','GESTAO','PRODUCAO'];
roles.forEach((role,index) => db.prepare('INSERT INTO users (id,name,role) VALUES (?,?,?)').run(index+1, `Pessoa ${index+1}`, role));
db.exec("INSERT INTO users (id,name,role,ativo,archived_at) VALUES(80,'Inativo','MECANICO',0,NULL),(81,'Arquivado','MECANICO',1,'2026-01-01'),(82,'Sem perfil','DESCONHECIDO',1,NULL)");
const service = require('../modules/pcm/pcm.agenda.service');
const demandas = require('../modules/demandas/demandas.service');
const operational = require('../modules/pcm/pcm.operational.service');
const user = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
const admin = () => user(1);
const criar = (flag = '1') => demandas.create({ titulo: 'Fabricação de teste', descricao: 'Escopo preservado', equipamento_id: 1, setor_origem: 'Produção', requer_instalacao: flag }, admin());
const payload = patch => ({ etapa: 'SERVICO', data_programada: '2026-11-10', horario: '08:30', responsavel_user_id: 2, local_servico: 'Área de instalação', preparacao: 'Separar materiais no almoxarifado.', horas_estimadas: '2', ...patch });
const count = table => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;

test.beforeEach(() => db.exec('DELETE FROM notificacoes; DELETE FROM pcm_programacao_demandas; DELETE FROM demanda_logs; DELETE FROM pcm_programacao_semanal; DELETE FROM os; DELETE FROM demandas;'));
test.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

test('migration preserva demandas existentes, inicia sem instalações presumidas e pode ser reaplicada', () => {
  const id = criar('0');
  migrate(migrationArgs);
  assert.equal(demandas.getById(id).titulo, 'Fabricação de teste');
  assert.equal(demandas.getById(id).requer_instalacao, 0);
  assert.equal(count('pcm_programacao_demandas'), 0);
  assert.equal(count('notificacoes'), 0);
});

test('programação vincula demanda e gera avisos apenas para perfis ativos da reciclagem', () => {
  const id = criar();
  const evento = service.programar(id, payload(), admin());
  assert.equal(evento.demanda_id, id);
  assert.equal(demandas.getById(id).status, 'NOVA');
  assert.equal(count('os'), 0);
  assert.equal(count('pcm_programacao_semanal'), 0);
  const destinatarios = db.prepare("SELECT u.role FROM notificacoes n JOIN users u ON u.id=n.user_id ORDER BY u.id").all().map(row => row.role);
  assert.deepEqual(destinatarios, roles.filter(role => !['ENCARREGADO_FRIGORIFICO','ENCARREGADO_LOGISTICA'].includes(role)));
  const aviso = service.notificacoes(user(3));
  assert.equal(aviso.total, 1);
  assert.match(aviso.items[0].mensagem, /10\/11\/2026 às 08:30/);
  assert.match(aviso.items[0].mensagem, /Separar materiais/);
  assert.equal(aviso.items[0].data_programada, '2026-11-10');
});

test('reenvio idêntico é idempotente; reprogramação atualiza o evento e avisa uma vez por versão', () => {
  const id = criar();
  const primeiro = service.programar(id, payload(), admin());
  const total = count('notificacoes');
  assert.equal(service.programar(id, payload(), admin()).alterado, false);
  assert.equal(count('notificacoes'), total);
  const reprogramado = service.programar(id, payload({ data_programada: '2026-11-18', preparacao: 'Nova preparação' }), admin());
  assert.equal(reprogramado.id, primeiro.id);
  assert.equal(reprogramado.versao, 2);
  assert.equal(count('pcm_programacao_demandas'), 1);
  assert.equal(count('notificacoes'), total * 2);
  assert.equal(service.listEventos({semana_inicio:'2026-11-09'}, user(3)).length, 0);
  assert.equal(service.listEventos({semana_inicio:'2026-11-18'}, user(3)).length, 1);
  const logs = demandas.getById(id).logs.map(log => log.texto).join('\n');
  assert.match(logs, /10\/11\/2026/);
  assert.match(logs, /18\/11\/2026/);
});

test('instalação só entra após fabricação concluída; conclusão de serviço libera a fila de instalação', () => {
  const id = criar();
  assert.throws(() => service.programar(id, payload({etapa:'INSTALACAO'}), admin()), /fabricação concluída/);
  const servico = service.programar(id, payload(), admin());
  service.alterarStatus(servico.id, {status:'CONCLUIDA',data_realizada:dateBr.todayISO()}, admin());
  assert.equal(demandas.getById(id).status, 'CONCLUIDA');
  assert.equal(service.listPendentes(admin())[0].etapa, 'INSTALACAO');
  const instalacao = service.programar(id, payload({etapa:'INSTALACAO',data_programada:'2026-11-19'}), admin());
  assert.equal(service.listPendentes(admin()).length, 0);
  service.alterarStatus(instalacao.id, {status:'CONCLUIDA',data_realizada:dateBr.todayISO()}, admin());
  assert.equal(service.historicoDemanda(id).length, 2);
  assert.equal(service.historicoDemanda(id)[1].data_realizada, dateBr.todayISO());
  assert.throws(() => service.programar(id, payload({etapa:'INSTALACAO'}), admin()), /já foi realizada/);
  assert.throws(() => service.marcarInstalacao(id, '0', admin()), /instalação vinculada/);
});

test('fechamento, reabertura e cancelamento da demanda sincronizam a agenda sem apagar histórico', () => {
  const id = criar();
  const evento = service.programar(id, payload(), admin());
  demandas.updateStatus(id, {status:'CONCLUIDA',user_id:1});
  assert.equal(service.historicoDemanda(id)[0].status, 'CONCLUIDA');
  const instalacao = service.programar(id, payload({etapa:'INSTALACAO'}), admin());
  demandas.updateStatus(id, {status:'EM_ANDAMENTO',user_id:1});
  assert.equal(service.historicoDemanda(id)[1].status, 'CANCELADA');
  assert.equal(service.listPendentes(admin())[0].etapa, 'SERVICO');
  const reaberto = service.programar(id, payload(), admin());
  assert.equal(reaberto.id, evento.id);
  assert.equal(reaberto.status, 'PROGRAMADA');
  assert.ok(demandas.getById(id).logs.some(log => /realizado em/.test(log.texto)));
  demandas.updateStatus(id, {status:'CONCLUIDA',user_id:1});
  const nova = service.programar(id, payload({etapa:'INSTALACAO'}), admin());
  assert.equal(nova.id, instalacao.id);
  demandas.updateStatus(id, {status:'CANCELADA',user_id:1});
  assert.equal(service.historicoDemanda(id)[1].status, 'CANCELADA');
  assert.throws(() => service.programar(id, payload(), admin()), /cancelada/);
  assert.ok(evento.id);
});

test('conclusão simples não presume instalação, mas PCM pode marcar uma fabricação já encerrada', () => {
  const id = criar('0');
  demandas.updateStatus(id, {status:'CONCLUIDA',user_id:1});
  assert.equal(service.listPendentes(admin()).length, 0);
  service.marcarInstalacao(id, '1', admin());
  assert.equal(service.listPendentes(admin())[0].etapa, 'INSTALACAO');
  service.programar(id, payload({etapa:'INSTALACAO'}), admin());
  assert.throws(() => demandas.updateDetails(id, {titulo:'Atualizado',requer_instalacao:'0',user_id:1,user_role:'ADMIN'}), /instalação vinculada/);
  assert.equal(demandas.getById(id).requer_instalacao, 1);
  assert.throws(() => demandas.remove(id, {user_id:1,user_role:'ADMIN'}), /histórico na agenda/);
});

test('validação rejeita datas impossíveis, responsável indisponível, horário e duração inválidos', () => {
  const id = criar();
  for (const patch of [{data_programada:'2026-02-30'},{responsavel_user_id:3},{responsavel_user_id:80},{responsavel_user_id:81},{horario:'25:00'},{horas_estimadas:-1},{horas_estimadas:100},{local_servico:''},{etapa:'OUTRA'}]) {
    assert.throws(() => service.programar(id, payload(patch), admin()));
  }
  assert.equal(count('pcm_programacao_demandas'), 0);
  assert.equal(count('notificacoes'), 0);
  const evento = service.programar(id, payload(), admin());
  assert.throws(() => service.alterarStatus(evento.id, {status:'CONCLUIDA',data_realizada:'2099-01-01'}, admin()), /futuro/);
  assert.throws(() => service.alterarStatus(evento.id, {status:'CONCLUIDA'}, admin()), /data válida/);
  service.alterarStatus(evento.id, {status:'EM_ANDAMENTO'}, admin());
  assert.equal(demandas.getById(id).status, 'EM_ANDAMENTO');
  assert.throws(() => service.programar(id, payload({data_programada:'2026-11-20'}), admin()), /em andamento/);
});

test('falha ao gravar aviso desfaz programação e histórico; também desfaz encerramento da demanda', () => {
  const id = criar();
  db.exec("CREATE TRIGGER agenda_notice_fail BEFORE INSERT ON notificacoes BEGIN SELECT RAISE(ABORT,'Falha simulada no aviso'); END");
  try { assert.throws(() => service.programar(id, payload(), admin()), /Falha simulada/); }
  finally { db.exec('DROP TRIGGER agenda_notice_fail'); }
  assert.equal(count('pcm_programacao_demandas'), 0);
  assert.equal(demandas.getById(id).logs.length, 1);
  service.programar(id, payload(), admin());
  db.exec("CREATE TRIGGER agenda_notice_fail BEFORE INSERT ON notificacoes BEGIN SELECT RAISE(ABORT,'Falha simulada no aviso'); END");
  try { assert.throws(() => demandas.updateStatus(id, {status:'CONCLUIDA',user_id:1}), /Falha simulada/); }
  finally { db.exec('DROP TRIGGER agenda_notice_fail'); }
  assert.equal(demandas.getById(id).status, 'NOVA');
  assert.equal(service.historicoDemanda(id)[0].status, 'PROGRAMADA');
});

test('leitura dos avisos pertence ao usuário e não altera notificações do chat de OS', () => {
  service.programar(criar(), payload(), admin());
  db.prepare("INSERT INTO notificacoes (user_id,origem_tipo,origem_id,titulo,mensagem) VALUES(3,'OS_CHAT',1,'Chat','Mensagem')").run();
  service.marcarLidas(user(3));
  assert.equal(service.notificacoes(user(3)).total, 0);
  assert.equal(service.notificacoes(user(4)).total, 1);
  assert.equal(db.prepare("SELECT lida FROM notificacoes WHERE origem_tipo='OS_CHAT'").get().lida, 0);
  assert.throws(() => service.marcarLidas(user(14)), {status:403});
});

test('permissões de agenda não ampliam o acesso ao PCM ou aos detalhes das demandas', () => {
  const id = criar();
  for (const actor of [user(2),user(3),user(4),user(14),user(15)]) {
    assert.throws(() => service.programar(id, payload(), actor), {status:403});
    assert.throws(() => service.marcarInstalacao(id, '1', actor), {status:403});
  }
  assert.throws(() => service.listEventos({}, user(14)), {status:403});
  assert.throws(() => service.listEventos({}, user(15)), {status:403});
  assert.equal(rbac.canAccessModule('ALMOXARIFADO','pcm'), false);
  assert.equal(rbac.canAccessModule('ALMOXARIFADO','agenda_servicos_view'), true);
  assert.deepEqual(service.semana('2026-11-08').dias, ['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
});

test('agenda de OS existente continua independente das etapas da demanda', () => {
  db.prepare("INSERT INTO os(id,equipamento_id,status) VALUES(1,1,'ABERTA')").run();
  operational.scheduleBacklogItem(1, {data_programada:'2026-11-10',responsavel_user_id:2},1);
  service.programar(criar(), payload(), admin());
  assert.equal(operational.getWeeklySchedule({semana_inicio:'2026-11-09'}).itens.length, 1);
  assert.equal(service.listEventos({semana_inicio:'2026-11-09'},user(3)).length, 1);
  assert.equal(db.prepare('SELECT status FROM os').get().status, 'ABERTA');
});

test('rotas protegem gestão, excluem frigorífico/logística e renderizam a agenda compartilhada', async () => {
  const id = criar();
  service.programar(id,payload({preparacao:'<script>alert(1)</script>'}),admin());
  const app = express();
  app.set('views',path.join(__dirname,'../views'));
  app.engine('ejs',ejs.renderFile); app.set('view engine','ejs');
  app.use(express.urlencoded({extended:false}));
  app.use((req,res,next) => {
    req.session={user:user(Number(req.headers['x-test-user']||1))}; req.flash=()=>{};
    Object.assign(res.locals,{user:req.session.user,canAccessModule:rbac.canAccessModule,normalizeRole:rbac.normalizeRole,layout(){}}); next();
  });
  app.use('/pcm',require('../modules/pcm/pcm.routes'));
  app.use((error,req,res,next)=>res.status(error.status||500).send(error.message));
  const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for (const person of [14,15]) {
      const denied=await fetch(`${base}/pcm/agenda`,{headers:{'x-test-user':String(person),accept:'application/json'}}); assert.equal(denied.status,403);
    }
    const page=await fetch(`${base}/pcm/agenda?semana_inicio=2026-11-09`,{headers:{'x-test-user':'3'}});
    assert.equal(page.status,200); const html=await page.text();
    assert.match(html,/Agenda de serviços e instalações/); assert.match(html,/Fabricação de teste/);
    assert.match(html,/&lt;script&gt;/); assert.doesNotMatch(html,/<script>alert/);
    assert.doesNotMatch(html,/action="\/pcm\/programacao-semanal/);
    assert.doesNotMatch(html,/Escopo preservado/);
    const denied=await fetch(`${base}/pcm/programacao-semanal/demandas/${id}/programar`,{method:'POST',headers:{'x-test-user':'3',accept:'application/json'}}); assert.equal(denied.status,403);
    const post=await fetch(`${base}/pcm/programacao-semanal/demandas/${id}/programar`,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(payload({data_programada:'2026-11-18'}))});
    assert.equal(post.status,302); assert.match(post.headers.get('location'),/semana_inicio=2026-11-18/);
    const read=await fetch(`${base}/pcm/agenda/notificacoes/lidas`,{method:'POST',redirect:'manual',headers:{'x-test-user':'3'}}); assert.equal(read.status,302);
    assert.equal(service.notificacoes(user(3)).total,0);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
