const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createOperationalCriticalityService } = require('../modules/dashboard/operational-criticality.service');

function makeDb() {
  const raw = new DatabaseSync(':memory:');
  const db = { exec: (sql) => raw.exec(sql), prepare: (sql) => { const st = raw.prepare(sql); const names = new Set([...sql.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1])); const clean = (args) => args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) ? [Object.fromEntries(Object.entries(args[0]).filter(([k]) => names.has(k)))] : args; return { run: (...a) => st.run(...clean(a)), get: (...a) => st.get(...clean(a)), all: (...a) => st.all(...clean(a)) };  } };
  db.exec(`
    CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, nome TEXT, setor TEXT, criticidade TEXT, ativo INTEGER DEFAULT 1, status_operacional TEXT);
    CREATE TABLE os (id INTEGER PRIMARY KEY, equipamento TEXT NOT NULL, descricao TEXT, tipo TEXT, tipo_manutencao TEXT, status TEXT, prioridade TEXT, grau TEXT, equipamento_id INTEGER, opened_at TEXT, closed_at TEXT);
  `);
  const eq = db.prepare('INSERT INTO equipamentos (id,nome,setor,criticidade,ativo,status_operacional) VALUES (?,?,?,?,?,?)');
  ['Prensa A','Prensa B','Digestor C','Esteira D','Bomba E','Rosca F'].forEach((nome, idx) => eq.run(idx+1, nome, idx%2?'Setor 2':'Setor 1', idx===0?'CRITICA':'MEDIA', 1, 'ATIVO'));
  const os = db.prepare('INSERT INTO os (id,equipamento,descricao,tipo,tipo_manutencao,status,prioridade,grau,equipamento_id,opened_at,closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  let id = 1;
  function add(eid, day, tipo='CORRETIVA', status='CONCLUIDA', grau='MEDIA', desc='Falha rolamento') { os.run(id++, `Eq ${eid}`, desc, tipo, tipo, status, grau, grau, eid, `2026-07-${String(day).padStart(2,'0')} 08:00:00`, status === 'CONCLUIDA' ? `2026-07-${String(day+1).padStart(2,'0')} 08:00:00` : null); }
  [1,5,10,15,20,25].forEach(d => add(1,d,'CORRETIVA','CONCLUIDA','CRITICA'));
  [1,10,20,25].forEach(d => add(2,d));
  [1,20,25].forEach(d => add(3,d));
  [1,25].forEach(d => add(4,d));
  add(5,1); add(6,1); add(6,2,'PREVENTIVA'); add(6,3,'CORRETIVA','CANCELADA');
  return db;
}

test('ranking limita top 5, ordena desc e ignora preventivas/canceladas', () => {
  const svc = createOperationalCriticalityService(makeDb());
  const ranking = svc.getRanking(svc.parseFilters({ inicio:'2026-07-01', fim:'2026-07-31' }));
  assert.equal(ranking.length, 5);
  assert.deepEqual(ranking.map(i => i.total_falhas), [6,4,3,2,1]);
  assert.equal(ranking.find(i => i.equipamento_nome === 'Rosca F'), undefined);
});

test('calcula dias entre falhas e indica dados insuficientes para ocorrência única', () => {
  const svc = createOperationalCriticalityService(makeDb());
  const ranking = svc.getRanking(svc.parseFilters({ inicio:'2026-07-01', fim:'2026-07-31' }));
  const prensaA = ranking.find(i => i.equipamento_nome === 'Prensa A');
  assert.equal(prensaA.intervalo.menor, 4);
  assert.equal(prensaA.intervalo.maior, 5);
  assert.equal(prensaA.intervalo.insuficiente, false);
  const bomba = ranking.find(i => i.equipamento_nome === 'Bomba E');
  assert.equal(bomba.frequencia_media, 'Dados insuficientes');
  assert.equal(bomba.intervalo.insuficiente, true);
});

test('aplica filtros, payload vazio/nulos e permissões', () => {
  const svc = createOperationalCriticalityService(makeDb());
  assert.equal(svc.getRanking(svc.parseFilters({ setor:'Setor 2', inicio:'2026-07-01', fim:'2026-07-31' }))[0].setor, 'Setor 2');
  assert.doesNotThrow(() => svc.getDashboard({}));
  assert.equal(svc.canView('DIRECAO'), true);
  assert.equal(svc.canManage('DIRECAO'), false);
  assert.equal(svc.canManage('ADMIN'), true);
});

test('sugestões automáticas são identificadas como sugestão, não decisão definitiva', () => {
  const svc = createOperationalCriticalityService(makeDb());
  const items = svc.getIntervencoes(svc.parseFilters({ inicio:'2026-07-01', fim:'2026-07-31' }));
  assert.ok(items.length > 0);
  assert.ok(items.every(i => /Sugestão do sistema/.test(i.situacao_solicitacao)));
});

test('template EJS possui guardas para dados completos, vazios e nulos', () => {
  const file = path.join(__dirname, '..', 'views', 'dashboard', 'criticidade.ejs');
  const source = require('node:fs').readFileSync(file, 'utf8');
  assert.ok(source.includes('criticidadeOperacional') && source.includes('? criticidadeOperacional : {}'));
  assert.match(source, /!ranking\.length/);
  assert.match(source, /!interv\.length/);
  assert.doesNotThrow(() => createOperationalCriticalityService(makeDb()).getDashboard({ inicio:'2026-07-01', fim:'2026-07-31' }));
});

test('dashboard principal protege a criticidade operacional antes de exibir a tendência', () => {
  const file = path.join(__dirname, '..', 'views', 'dashboard', 'index.ejs');
  const source = require('node:fs').readFileSync(file, 'utf8');
  const guard = source.indexOf("const safeCriticidadeOperacional = (typeof criticidadeOperacional !== 'undefined'");
  const usage = source.indexOf('safeCriticidadeOperacional?.tendencia?.resumo');
  assert.ok(guard >= 0, 'a variável segura deve ser declarada');
  assert.ok(usage > guard, 'a variável segura deve ser declarada antes do uso');
});

test('clique no equipamento direciona ao histórico correto', () => {
  const svc = createOperationalCriticalityService(makeDb());
  const ranking = svc.getRanking(svc.parseFilters({ inicio:'2026-07-01', fim:'2026-07-31' }));
  assert.equal(ranking[0].historico_url, '/equipamentos/1?tab=historico');
});
