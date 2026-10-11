const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
process.env.DB_PATH = path.join(os.tmpdir(), `preventivas-lancamento-${process.pid}.sqlite`);
const db = require('../database/db');
const service = require('../modules/preventivas/preventivas.service');
const osService = require('../modules/os/os.service');

db.exec(`
  CREATE TABLE config_sistema (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE preventiva_logs (id INTEGER PRIMARY KEY, preventiva_execucao_id INTEGER, preventiva_plano_id INTEGER, acao TEXT, usuario_id INTEGER, usuario_nome TEXT, detalhes_json TEXT);
  CREATE TABLE equipamentos (id INTEGER PRIMARY KEY, nome TEXT, tipo TEXT, criticidade TEXT, ativo INTEGER);
  CREATE TABLE preventiva_planos (id INTEGER PRIMARY KEY, equipamento_id INTEGER, titulo TEXT, origem TEXT, frequencia_tipo TEXT, frequencia_valor INTEGER, ativo INTEGER);
  CREATE TABLE preventiva_execucoes (id INTEGER PRIMARY KEY, plano_id INTEGER, data_prevista TEXT, status TEXT, criticidade TEXT, responsavel_1_id INTEGER, responsavel_2_id INTEGER);
  CREATE TABLE os (id INTEGER PRIMARY KEY, preventiva_execucao_id INTEGER);
  INSERT INTO equipamentos VALUES (1, 'Equipamento de teste', 'teste', 'MEDIA', 1);
  INSERT INTO preventiva_planos VALUES (1, 1, 'Inspeção existente', 'PROGRAMADA_SEMANAL', 'semanal', 1, 1);
  INSERT INTO preventiva_execucoes VALUES (1, 1, '2026-10-12', 'PENDENTE', 'MEDIA', NULL, NULL);
`);

test('regra editada é persistida com autoria e histórico', () => {
  service.salvarRegraLancamento({ horario: '05:00', adiarFeriados: true, feriadosLocais: [] }, { id: 9, name: 'Gestor teste' });
  assert.equal(service.getRegraLancamento().horario, '05:00');
  const log = db.prepare('SELECT * FROM preventiva_logs WHERE acao = ?').get('PREVENTIVAS_REGRA_LANCAMENTO');
  assert.equal(log.usuario_id, 9);
  assert.equal(JSON.parse(log.detalhes_json).regra.adiarFeriados, true);
  assert.throws(() => service.salvarRegraLancamento({ horario: '25:00' }));
  assert.equal(service.getRegraLancamento().horario, '05:00');
});

test('feriado e madrugada bloqueiam automático e manual sem marcar semana como processada', () => {
  for (const automatico of [true, false]) {
    for (const iso of ['2026-10-12T05:00:00-03:00', '2026-10-13T04:59:59-03:00']) {
      assert.equal(service.lancarProgramadasComoOSDaSegunda({ refDate: new Date(iso), automatico }).skipped, true);
    }
  }
  assert.equal(db.prepare('SELECT valor FROM config_sistema WHERE chave = ?').get('preventiva_programada_os_semana_2026-10-12'), undefined);
  assert.equal(service.lancarLoteDiarioPreventivasComoOS({ refDate: new Date('2026-10-13T04:59:00-03:00') }).skipped, true);
  assert.equal(service.lancarLoteDiarioPreventivasComoOS({ refDate: new Date('2026-10-12T10:00:00-03:00') }).skipped, true);
});

test('terça às 5h abre OS da segunda, preserva plano e não duplica em novos ticks ou reinício', () => {
  const original = osService.createOSAutomatica;
  const criadas = [];
  osService.createOSAutomatica = (input) => {
    criadas.push(input);
    return Number(db.prepare('INSERT INTO os (preventiva_execucao_id) VALUES (?)').run(input.preventiva_execucao_id).lastInsertRowid);
  };
  try {
    const result = service.lancarProgramadasComoOSDaSegunda({ refDate: new Date('2026-10-13T05:00:00-03:00'), automatico: true });
    assert.equal(result.osGeradas, 1);
    assert.equal(result.dataSegunda, '2026-10-12');
    assert.equal(result.dataLancamento, '2026-10-13');
    assert.equal(criadas[0].metadata.horario_lancamento, '05:00');
    assert.equal(service.lancarProgramadasComoOSDaSegunda({ refDate: new Date('2026-10-14T08:00:00-03:00'), automatico: true }).reason, 'already_processed_week');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM os').get().n, 1);
    assert.equal(db.prepare('SELECT data_prevista FROM preventiva_execucoes WHERE id = 1').get().data_prevista, '2026-10-12');
  } finally { osService.createOSAutomatica = original; }
});
