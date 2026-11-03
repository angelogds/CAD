const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const Database = require('better-sqlite3');
const retencao = require('../modules/escala/escala.retencao.service');
const geo = require('../modules/escala/escala.geo');
const migrarGps = require('../database/migrations/243_escala_localizacao_obrigatoria');
const migrarRetencao = require('../database/migrations/244_escala_exclusao_retencao_seis_meses');
const root = path.resolve(__dirname,'..');
const admin = { id: 1, role: 'ADMIN' };
const gps = { latitude_inicio:-12.2,longitude_inicio:-39,precisao_inicio:8,latitude_fim:-12.2,longitude_fim:-39,precisao_fim:10 };
function fixture(t) {
  const db = new Database(':memory:'); t.after(()=>db.close());
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,role TEXT,ativo INTEGER);
    CREATE TABLE colaboradores(id INTEGER PRIMARY KEY,nome TEXT,funcao TEXT,user_id INTEGER,ativo INTEGER DEFAULT 1);
    CREATE TABLE equipamentos(id INTEGER PRIMARY KEY,nome TEXT);
    CREATE TABLE os(id INTEGER PRIMARY KEY,equipamento_id INTEGER,equipamento TEXT,descricao TEXT,status TEXT);
    INSERT INTO users VALUES(1,'Gestão','ADMIN',1),(2,'Pessoa retirada','MECANICO',1),(3,'Outra pessoa','MECANICO',1);
    INSERT INTO colaboradores VALUES(1,'Pessoa retirada','MECANICO',2,1),(2,'Outra pessoa','MECANICO',3,1);
    INSERT INTO os VALUES(1,NULL,'Equipamento','Serviço','ABERTA');
  `);
  db.exec(fs.readFileSync(path.join(root,'database/migrations/163_escala_banco_horas_manutencao.sql'),'utf8'));
  db.exec(`ALTER TABLE escala_horas_extras ADD COLUMN inicio_fixo_17h INTEGER DEFAULT 0;
    CREATE TABLE escala_rodizio_itens(id INTEGER PRIMARY KEY,colaborador_id INTEGER,ativo INTEGER);
    CREATE TABLE escala_diurno_fixos(id INTEGER PRIMARY KEY,colaborador_id INTEGER,ativo INTEGER);
    CREATE TABLE escala_entries(id INTEGER PRIMARY KEY,colaborador_id INTEGER);
    CREATE TABLE escala_compensacoes(id INTEGER PRIMARY KEY,colaborador_id INTEGER);
    CREATE TABLE escala_concessoes(id INTEGER PRIMARY KEY,colaborador_id INTEGER,ref_compensacao_id INTEGER REFERENCES escala_compensacoes(id));
    CREATE TABLE escala_folga_solicitacoes(id INTEGER PRIMARY KEY,colaborador_id INTEGER,folga_id INTEGER REFERENCES escala_folgas_programadas(id));
    CREATE TABLE escala_auditoria(id INTEGER PRIMARY KEY,entidade TEXT,entidade_id INTEGER,antes_json TEXT,depois_json TEXT,usuario TEXT,created_at TEXT);
    CREATE TABLE escala_alteracoes_historico(id INTEGER PRIMARY KEY,escala_anterior TEXT,nova_escala TEXT);
    CREATE TABLE estoque_movimentos(id INTEGER PRIMARY KEY,colaborador_id INTEGER);
    INSERT INTO estoque_movimentos VALUES(1,1);
    INSERT INTO escala_horas_extras(id,user_id,colaborador_id,os_id,data_servico,inicio_extra,fim_extra,total_minutos,descricao_servico,status,foto_inicio_path)
      VALUES(1,2,1,1,'2026-10-01','2026-10-01T20:00:00Z','2026-10-01T21:00:00Z',60,'Serviço','APROVADO','/uploads/escala-horas/propria.jpg'),
      (2,3,2,1,'2026-10-01','2026-10-01T20:00:00Z','2026-10-01T22:00:00Z',120,'Serviço','APROVADO','/uploads/escala-horas/compartilhada.jpg');
    INSERT INTO escala_banco_horas_movimentos(colaborador_id,hora_extra_id,tipo,minutos,data_movimento) VALUES(1,1,'CREDITO_HORA_EXTRA',60,'2026-10-01'),(2,2,'CREDITO_HORA_EXTRA',120,'2026-10-01');
    INSERT INTO escala_folgas_programadas(id,colaborador_id,data_folga,minutos_descontados) VALUES(1,1,'2026-10-02',60);
    INSERT INTO escala_folga_solicitacoes VALUES(1,1,1);
    INSERT INTO escala_compensacoes VALUES(1,1);
    INSERT INTO escala_concessoes VALUES(1,1,1);
    INSERT INTO escala_entries VALUES(1,1),(2,2);
    INSERT INTO escala_rodizio_itens VALUES(1,1,1),(2,2,1);
    INSERT INTO escala_diurno_fixos VALUES(1,1,1);
    INSERT INTO escala_auditoria VALUES(1,'escala_horas_extras',1,'{"colaborador_id":1,"nome":"Pessoa retirada"}',NULL,'Gestão','2026-10-01');
    INSERT INTO escala_alteracoes_historico VALUES(1,'[{"colaborador_id":1,"nome":"Pessoa retirada"},{"colaborador_id":2,"nome":"Outra pessoa"}]','[]');`);
  const contexto = {
    db, tableExists: nome=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nome)),
    addColumnIfMissing(t,c,def){if(!db.prepare(`PRAGMA table_info(${t})`).all().some(x=>x.name===c))db.exec(`ALTER TABLE ${t} ADD COLUMN ${def}`);},
  };
  migrarGps(contexto);migrarRetencao(contexto);migrarRetencao(contexto);
  const filename=path.join(root,'modules/escala/escala.service.js'), realRequire=createRequire(filename), module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:n=>n==='../../database/db'?db:realRequire(n),console});
  return {db,service:module.exports,contexto};
}

test('exclusão oculta Escala/HE/banco e não altera perfil, OS ou estoque',t=>{
  const {db,service}=fixture(t);
  const prazo=retencao.excluir(db,1,admin,'2026-11-03T12:00:00Z');
  assert.equal(prazo.apagar_apos,'2027-05-03T12:00:00.000Z');
  assert.deepEqual(Array.from(service.listarColaboradoresManutencao(),c=>c.id),[2]);
  assert.deepEqual(Array.from(service.listarHorasExtras(),h=>h.colaborador_id),[2]);
  assert.equal(service.buscarColaboradorDoUsuario(2),null);
  assert.equal(service.buscarHoraExtraPorId(1),undefined);
  assert.equal(service.calcularSaldoBancoHoras(1).minutos,0);
  assert.deepEqual([...service.listarMovimentosBancoHoras(1)],[]);
  assert.throws(()=>service.iniciarHoraExtra({...gps,colaborador_id:1,descricao_servico:'Serviço'}),/fora da Escala/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_horas_extras').get().n,2);
  assert.equal(db.prepare('SELECT ativo FROM users WHERE id=2').get().ativo,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM os').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estoque_movimentos').get().n,1);
  assert.equal(db.prepare('SELECT ativo FROM escala_rodizio_itens WHERE id=1').get().ativo,0);
  assert.equal(db.prepare('SELECT ativo FROM escala_rodizio_itens WHERE id=2').get().ativo,1);
  // Uma sincronização de perfil não reativa alguém removido da Escala.
  db.prepare('UPDATE colaboradores SET fora_escala=0 WHERE id=1').run();
  assert.equal(retencao.disponivel(db,1),false);
  assert.equal(service.listarHorasExtras().length,1);
  const repetido=retencao.excluir(db,1,admin,'2026-12-03T12:00:00Z');
  assert.equal(repetido.apagar_apos,prazo.apagar_apos);
});

test('prazo usa seis meses de calendário, com ajuste no fim do mês',()=>{
  assert.equal(retencao.seisMesesDepois('2026-08-31T14:25:00Z'),'2027-02-28T14:25:00.000Z');
  assert.equal(retencao.seisMesesDepois('2027-08-31T14:25:00Z'),'2028-02-29T14:25:00.000Z');
});

test('purga só depois do prazo, apaga dados/fotos próprios e preserva outras pessoas e módulos',t=>{
  const {db}=fixture(t),dir=fs.mkdtempSync(path.join(os.tmpdir(),'escala-retencao-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'escala-horas'));
  for(const nome of ['propria.jpg','compartilhada.jpg'])fs.writeFileSync(path.join(dir,'escala-horas',nome),'teste');
  db.prepare("UPDATE escala_horas_extras SET foto_fim_path='/uploads/escala-horas/compartilhada.jpg' WHERE id=1").run();
  retencao.excluir(db,1,admin,'2026-11-03T12:00:00Z');
  assert.equal(retencao.purgarVencidos(db,{agora:'2027-05-03T11:59:59.999Z',uploadDir:dir}).purgados,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_horas_extras').get().n,2);
  assert.equal(retencao.purgarVencidos(db,{agora:'2027-05-03T12:00:00Z',uploadDir:dir}).purgados,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_horas_extras').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_banco_horas_movimentos').get().n,1);
  for(const tabela of ['escala_compensacoes','escala_concessoes','escala_folga_solicitacoes','escala_folgas_programadas','escala_auditoria']) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${tabela}`).get().n,0,tabela);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM colaboradores').get().n,2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM os').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM estoque_movimentos').get().n,1);
  assert.equal(fs.existsSync(path.join(dir,'escala-horas/propria.jpg')),false);
  assert.equal(fs.existsSync(path.join(dir,'escala-horas/compartilhada.jpg')),true);
  const snapshot=JSON.parse(db.prepare('SELECT escala_anterior FROM escala_alteracoes_historico').get().escala_anterior);
  assert.deepEqual(snapshot,[{colaborador_id:2,nome:'Outra pessoa'}]);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(retencao.purgarVencidos(db,{agora:'2027-06-03T12:00:00Z',uploadDir:dir}).purgados,0);
});

test('perfil operacional não pode excluir pessoa da Escala',t=>{
  const {db}=fixture(t);
  assert.throws(()=>retencao.excluir(db,1,{id:2,role:'MECANICO'}),/permissão/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM escala_colaboradores_exclusoes').get().n,0);
});

test('GPS ausente, vazio ou inválido bloqueia início e fim no serviço e no banco',t=>{
  const {db,service,contexto}=fixture(t);
  for(const dados of [{},{latitude_inicio:'',longitude_inicio:' ',precisao_inicio:0},{...gps,latitude_inicio:91},{...gps,precisao_inicio:-1}]) {
    assert.throws(()=>service.iniciarHoraExtra({...dados,colaborador_id:1,descricao_servico:'Serviço'}),/localização/);
  }
  assert.throws(()=>db.prepare("INSERT INTO escala_horas_extras(colaborador_id,data_servico,inicio_extra,descricao_servico) VALUES(1,'2026-11-03','2026-11-03T20:00:00Z','Serviço')").run(),/Localização obrigatória/);
  const id=service.iniciarHoraExtra({...gps,colaborador_id:1,descricao_servico:'Serviço'});
  db.prepare("UPDATE escala_horas_extras SET inicio_extra=datetime('now','-1 hour') WHERE id=?").run(id);
  assert.throws(()=>service.finalizarHoraExtra(id,{}),/localização/);
  assert.throws(()=>db.prepare("UPDATE escala_horas_extras SET status='PENDENTE_APROVACAO' WHERE id=?").run(id),/Localização obrigatória/);
  assert.equal(db.prepare('SELECT status FROM escala_horas_extras WHERE id=?').get(id).status,'EM_ANDAMENTO');
  service.finalizarHoraExtra(id,gps);
  const row=db.prepare('SELECT * FROM escala_horas_extras WHERE id=?').get(id);
  assert.equal(row.status,'PENDENTE_APROVACAO');assert.equal(row.latitude_fim,gps.latitude_fim);
  // Migração idempotente e históricos anteriores sem GPS são mantidos.
  migrarGps(contexto);assert.equal(db.prepare('SELECT latitude_inicio FROM escala_horas_extras WHERE id=1').get().latitude_inicio,null);
  assert.deepEqual(geo.exigirLocalizacao({latitude_inicio:0,longitude_inicio:0,precisao_inicio:0},'inicio'),{latitude:0,longitude:0,precisao:0});
});
