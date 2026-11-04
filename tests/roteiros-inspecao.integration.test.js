const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const ejs = require('ejs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'roteiros-inspecao-'));
process.env.DB_PATH = path.join(directory, 'test.sqlite');
const db = require('../database/db');
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY,name TEXT,email TEXT,role TEXT,ativo INTEGER DEFAULT 1,archived_at TEXT);
  CREATE TABLE colaboradores (id INTEGER PRIMARY KEY,user_id INTEGER,nome TEXT,funcao TEXT,ativo INTEGER DEFAULT 1);
  CREATE TABLE equipamentos (id INTEGER PRIMARY KEY,nome TEXT,codigo TEXT,setor TEXT,tipo TEXT,criticidade TEXT,ativo INTEGER DEFAULT 1);
  CREATE TABLE os (id INTEGER PRIMARY KEY,equipamento TEXT,equipamento_id INTEGER,descricao TEXT,tipo TEXT,status TEXT,opened_by INTEGER,origem TEXT,prioridade TEXT,metadata_automacao_json TEXT);
  INSERT INTO users (id,name,email,role) VALUES
    (1,'Gestor','gestor@example.test','ADMIN'),(2,'Mecânico eleito','eleito@example.test','MECANICO'),
    (3,'Outro mecânico','outro@example.test','MECANICO'),(4,'Usuário RH','rh@example.test','RH'),
    (5,'Encarregado','enc@example.test','ENCARREGADO_MANUTENCAO'),(6,'Supervisor','sup@example.test','MANUTENCAO_SUPERVISOR');
  INSERT INTO colaboradores (id,user_id,nome,funcao) VALUES (10,2,'Mecânico eleito','Mecânico'),(20,3,'Outro mecânico','Mecânico');
  INSERT INTO equipamentos (id,nome,codigo,setor,tipo,criticidade) VALUES
    (1,'Equipamento A','EQ-1','Setor A','Motor','MEDIA'),(2,'Equipamento B','EQ-2','Setor B','Motor','ALTA'),
    (3,'Equipamento C','EQ-3','Setor B','Motor','MEDIA'),(4,'Equipamento D','EQ-4','Setor A','Motor','BAIXA');
`);
require('../database/migrations/185_pcm_operacional_real')({ db });
const migrate = require('../database/migrations/246_roteiros_inspecao_equipamentos');
migrate({ db });
const service = require('../modules/inspecao/roteiros.service');
const osService = require('../modules/os/os.service');
const operational = require('../modules/pcm/pcm.operational.service');
const originalCreate = osService.createOSAutomatica;
const originalSchedule = operational.scheduleBacklogItem;
const user = (id) => db.prepare('SELECT * FROM users WHERE id=?').get(id);
const gestor = () => user(1);
const mecanico = () => user(2);

test.beforeEach(() => {
  db.exec('DELETE FROM inspecao_roteiro_logs; DELETE FROM inspecao_roteiro_itens; DELETE FROM inspecao_roteiros; DELETE FROM pcm_programacao_semanal; DELETE FROM os;');
  osService.createOSAutomatica = (input) => Number(db.prepare('INSERT INTO os (equipamento_id,descricao,tipo,status,opened_by,origem,prioridade,metadata_automacao_json) VALUES (?,?,?,\'ABERTA\',?,?,?,?)')
    .run(input.equipamento_id, input.descricao, input.tipo, input.opened_by, input.origem, input.prioridade, JSON.stringify(input.metadata)).lastInsertRowid);
  operational.scheduleBacklogItem = originalSchedule;
});
test.after(() => {
  osService.createOSAutomatica = originalCreate;
  operational.scheduleBacklogItem = originalSchedule;
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function criar(equipment = [1, 2]) {
  return service.criarRoteiro({ titulo: 'Inspeção de teste', data_prevista: '2026-11-10', responsavel_user_id: 2, equipamento_ids: equipment, instrucoes: 'Verificar condição dos equipamentos.' }, gestor());
}
function registros(id, resultados = ['PREVENTIVA', 'CORRETIVA']) {
  return service.getRoteiro(id, gestor()).itens.map((item, index) => ({
    id: item.id, resultado: resultados[index] || 'SEM_NECESSIDADE', orientacao_preventiva: 'Programar revisão das correias.',
    orientacao_corretiva: 'Corrigir vazamento identificado.', observacao: 'Condição observada em campo.', prioridade_sugerida: 'ALTA',
  }));
}
function enviar(id, resultados) {
  return service.registrarInspecoes(id, registros(id, resultados), true, mecanico());
}
function programacao(tipo = 'PREVENTIVA') {
  return { tipo, decisao: 'PROGRAMADA', data_programada: '2026-11-12', responsavel_user_id: 3, prioridade: 'MEDIA', parecer: 'Serviço aprovado pelo PCM.' };
}

test('migration é aditiva e pode ser reaplicada preservando roteiro e equipamentos', () => {
  const id = criar();
  migrate({ db });
  assert.equal(service.getRoteiro(id, gestor()).itens.length, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM equipamentos').get().n, 4);
});

test('distribuição e inspeção não abrem nenhuma OS e somente o mecânico eleito acessa seus registros', () => {
  const id = criar();
  assert.equal(service.listRoteiros(mecanico()).length, 1);
  assert.equal(service.listRoteiros(user(3)).length, 0);
  assert.throws(() => service.getRoteiro(id, user(3)), { status: 403 });
  assert.throws(() => service.getRoteiro(id, user(4)), { status: 403 });
  assert.throws(() => service.criarRoteiro({}, mecanico()), { status: 403 });
  const rote = enviar(id);
  assert.equal(rote.status, 'ENVIADO_PCM');
  assert.equal(rote.inspecionados, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM os').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pcm_programacao_semanal').get().n, 0);
  assert.equal(service.listRoteiros(gestor())[0].pendentes_pcm, 2);
  assert.throws(() => service.registrarInspecoes(id, registros(id), false, user(3)), { status: 403 });
  assert.throws(() => service.registrarInspecoes(id, registros(id), false, gestor()), { status: 403 });
});

test('valida calendário, equipamentos ativos e mecânico ativo antes de criar', () => {
  for (const patch of [{ data_prevista: '2026-02-30' }, { responsavel_user_id: 4 }, { equipamento_ids: [999] }]) {
    assert.throws(() => service.criarRoteiro({ titulo: 'Teste', data_prevista: '2026-11-10', responsavel_user_id: 2, equipamento_ids: [1], ...patch }, gestor()));
  }
  db.prepare('UPDATE users SET ativo=0 WHERE id=2').run();
  try { assert.throws(() => criar(), /mecânico ativo/); }
  finally { db.prepare('UPDATE users SET ativo=1 WHERE id=2').run(); }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inspecao_roteiros').get().n, 0);
});

test('salvamento em lote é transacional, exige descrição e não envia roteiro incompleto', () => {
  const id = criar();
  const dados = registros(id);
  dados[1].orientacao_corretiva = '';
  assert.throws(() => service.registrarInspecoes(id, dados, false, mecanico()), /Descreva/);
  assert.equal(service.getRoteiro(id, gestor()).inspecionados, 0);
  assert.throws(() => service.registrarInspecoes(id, [registros(id)[0]], true, mecanico()), /todos os equipamentos/);
  assert.equal(service.getRoteiro(id, gestor()).inspecionados, 0);
  service.registrarInspecoes(id, [registros(id)[0]], false, mecanico());
  assert.equal(service.getRoteiro(id, gestor()).inspecionados, 1);
  const outra = criar([3]);
  assert.throws(() => service.registrarInspecoes(id, registros(outra, ['SEM_NECESSIDADE']), false, mecanico()), /não pertence/);
});

test('mecânico não programa e PCM não programa rascunho nem tipo não indicado', () => {
  const id = criar();
  const item = service.getRoteiro(id, gestor()).itens[0];
  assert.throws(() => service.analisarNecessidade(id, item.id, programacao(), mecanico()), { status: 403 });
  assert.throws(() => service.concluirRoteiro(id, mecanico()), { status: 403 });
  assert.throws(() => service.analisarNecessidade(id, item.id, programacao(), gestor()), /envio da inspeção/);
  enviar(id, ['PREVENTIVA', 'SEM_NECESSIDADE']);
  assert.throws(() => service.analisarNecessidade(id, item.id, programacao('CORRETIVA'), gestor()), /não foi indicada/);
  assert.throws(() => service.analisarNecessidade(id, item.id, { ...programacao(), data_programada: '2026-02-30' }, gestor()), /data válida/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM os').get().n, 0);
});

test('PCM define data e executor distintos do inspetor; reenvio não duplica OS nem agenda', () => {
  const id = criar([1]);
  const roteiro = enviar(id, ['AMBAS']);
  const item = roteiro.itens[0];
  for (const tipo of ['PREVENTIVA', 'CORRETIVA']) {
    const result = service.analisarNecessidade(id, item.id, programacao(tipo), gestor());
    const repeat = service.analisarNecessidade(id, item.id, programacao(tipo), gestor());
    assert.equal(repeat.osId, result.osId);
    assert.equal(repeat.existente, true);
    const agenda = db.prepare('SELECT * FROM pcm_programacao_semanal WHERE os_id=?').get(result.osId);
    assert.equal(agenda.data_programada, '2026-11-12');
    assert.equal(agenda.responsavel_user_id, 3);
    const ordem = db.prepare('SELECT * FROM os WHERE id=?').get(result.osId);
    assert.equal(ordem.tipo, tipo);
    assert.equal(ordem.opened_by, 1);
    assert.equal(ordem.origem, 'INSPECAO');
    assert.equal(JSON.parse(ordem.metadata_automacao_json).inspecionado_por, 2);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pcm_programacao_semanal').get().n, 2);
  assert.equal(service.concluirRoteiro(id, gestor()), true);
  assert.equal(service.concluirRoteiro(id, gestor()), false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM os WHERE status='ABERTA'").get().n, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM inspecao_roteiro_logs WHERE acao='ROTEIRO_CONCLUIDO'").get().n, 1);
  assert.throws(() => service.registrarInspecoes(id, registros(id), false, mecanico()), { status: 409 });
});

test('conclusão exige parecer para todas as indicações; dispensar exige justificativa e não cria OS', () => {
  for (const role of ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO']) {
    const actor = { ...gestor(), role };
    const id = criar([1]);
    const item = enviar(id, ['PREVENTIVA']).itens[0];
    assert.throws(() => service.concluirRoteiro(id, actor), /Avalie todas/);
    assert.throws(() => service.analisarNecessidade(id, item.id, { tipo: 'PREVENTIVA', decisao: 'DISPENSADA' }, actor), /Justifique/);
    service.analisarNecessidade(id, item.id, { tipo: 'PREVENTIVA', decisao: 'DISPENSADA', parecer: 'Atividade já contemplada no plano vigente.' }, actor);
    service.concluirRoteiro(id, actor);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM os').get().n, 0);
});

test('falha na programação desfaz OS e decisão; nova tentativa funciona', () => {
  const id = criar([1]);
  const item = enviar(id, ['CORRETIVA']).itens[0];
  operational.scheduleBacklogItem = () => { throw new Error('Programação indisponível'); };
  assert.throws(() => service.analisarNecessidade(id, item.id, programacao('CORRETIVA'), gestor()), /Programação indisponível/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM os').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pcm_programacao_semanal').get().n, 0);
  assert.equal(service.getRoteiro(id, gestor()).itens[0].corretiva_decisao, 'PENDENTE');
  operational.scheduleBacklogItem = originalSchedule;
  assert.ok(service.analisarNecessidade(id, item.id, programacao('CORRETIVA'), gestor()).osId);
});

test('views exibem coleta ao mecânico e programação somente ao PCM; conteúdo é escapado', () => {
  const id = criar([1]);
  const common = { layout() {}, dateBr: require('../utils/data-hora-br'), baseUrl: '/inspecao/roteiros', gestor: false, mecanicos: [], podeRegistrar: true, roteiro: service.getRoteiro(id, mecanico()) };
  common.roteiro.itens[0].observacao = '<script>teste</script>';
  const file = path.join(__dirname, '../views/inspecao/roteiros/show.ejs');
  const html = ejs.render(fs.readFileSync(file, 'utf8'), common, { filename: file });
  assert.match(html, /Enviar roteiro ao PCM/);
  assert.match(html, /&lt;script&gt;teste&lt;\/script&gt;/);
  assert.doesNotMatch(html, /name="data_programada"|Programar preventiva e gerar OS/);
  const enviado = enviar(id, ['PREVENTIVA']);
  const pcmHtml = ejs.render(fs.readFileSync(file, 'utf8'), { ...common, gestor: true, podeRegistrar: false, roteiro: enviado, mecanicos: service.listMecanicos(), baseUrl: '/pcm/preventivas/roteiros' }, { filename: file });
  assert.match(pcmHtml, /name="data_programada"/);
  assert.match(pcmHtml, /Programar preventiva e gerar OS/);
});

test('rotas reais preservam ordem de matching e bloqueiam outros mecânicos, RH e programação pelo inspetor', async () => {
  const id = criar([1]);
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { user: user(Number(req.headers['x-test-user'])) };
    req.flash = () => {};
    res.render = (view, data) => res.json({ view, data });
    next();
  });
  app.use('/inspecao', require('../modules/inspecao/inspecao.routes'));
  app.use('/pcm/preventivas/roteiros', require('../modules/inspecao/roteiros.routes').pcm);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const request = (suffix, userId, method = 'GET') => fetch(url + suffix, { method, headers: { 'x-test-user': String(userId) }, redirect: 'manual' });
    const response = await request(`/inspecao/roteiros/${id}`, 2);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).view, 'inspecao/roteiros/show');
    assert.equal((await request(`/inspecao/roteiros/${id}`, 3)).status, 403);
    assert.equal((await request('/inspecao/roteiros', 4)).status, 403);
    assert.equal((await request(`/pcm/preventivas/roteiros/${id}/concluir`, 2, 'POST')).status, 403);
    assert.equal((await request(`/inspecao/roteiros/${id}/registrar`, 1, 'POST')).status, 403);
    assert.equal((await request('/pcm/preventivas/roteiros', 5)).status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM os').get().n, 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
