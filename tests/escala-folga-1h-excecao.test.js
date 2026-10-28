const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function fixture({ saldo = 480, programada = null, pendente = null, registro = null } = {}) {
  const state = { inserted: null, approved: null, updateArgs: null };
  const database = {
    prepare(sql) {
      return {
        get() {
          if (sql.includes('sqlite_master')) return { name: 'tabela' };
          if (sql.includes('FROM escala_folga_solicitacoes s')) return registro;
          if (sql.includes('SELECT id FROM escala_folga_solicitacoes')) return null;
          if (sql.includes('FROM escala_folgas_programadas f')) return programada;
          if (sql.includes('FROM escala_ausencias a')) return null;
          if (sql.includes('FROM escala_folga_solicitacoes s')) return pendente;
          return null;
        },
        run(...args) {
          if (sql.includes('INSERT INTO escala_folga_solicitacoes')) {
            state.inserted = { minutos: args[3], exigeExcecao: args[5], motivo: args[4] };
          }
          if (sql.includes('UPDATE escala_folga_solicitacoes') && sql.includes("status='APROVADA'")) {
            state.updateArgs = args;
          }
          return { lastInsertRowid: 81, changes: 1 };
        },
        all() { return []; },
      };
    },
    transaction(fn) { return fn; },
  };
  const dependencies = {
    '../../database/db': database,
    './escala.service': {
      buscarColaboradorDoUsuario: () => ({ id: 7 }),
      calcularSaldoBancoHoras: () => ({ minutos: saldo }),
      programarFolgaCompensatoria: (dados) => { state.approved = dados; return 55; },
    },
    '../../config/rbac': {
      normalizeRole: (role) => role,
      canAccessModule: (role, permission) =>
        permission === 'escala_manage' && ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR'].includes(role),
    },
    '../../utils/data-hora-br': {
      isValidISODate: (d) => /^\d{4}-\d{2}-\d{2}$/.test(d),
      todayISO: () => '2026-10-28',
      isMondayISO: (d) => new Date(d + 'T12:00:00Z').getUTCDay() === 1,
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(read('modules/escala/escala.folga-solicitacao.service.js'), {
    module, Date, require(name) {
      if (!(name in dependencies)) throw new Error('Dependency not mocked: ' + name);
      return dependencies[name];
    },
  }, { filename: 'escala.folga-solicitacao.service.js' });
  return { service: module.exports, state };
}

test('liberação de 1h desconta somente 60 minutos e exige saldo de 1h', () => {
  const { service, state } = fixture({ saldo: 60 });
  const id = service.solicitarFolga({
    user: { id: 42, role: 'MECANICO' },
    data_folga: '2026-10-29',
    periodo_folga: 'SAIDA_ANTECIPADA',
    motivo: 'Consulta pessoal',
  });
  assert.equal(id, 81);
  assert.equal(state.inserted.minutos, 60);
  assert.match(state.inserted.motivo, /saída 1h mais cedo/);
  assert.equal(service.PERIODOS_FOLGA.ENTRADA_TARDIA.minutos, 60);
  assert.throws(() => fixture({ saldo: 59 }).service.solicitarFolga({
    user: { id: 42 }, data_folga: '2026-10-29', periodo_folga: 'ENTRADA_TARDIA',
  }), /Saldo insuficiente/);
});

test('data ocupada aceita pedido pendente, mas não aprova segunda folga sem justificativa da gestão', () => {
  const ocupado = { id: 10, colaborador_id: 8, colaborador_nome: 'Outro colaborador' };
  const registro = {
    id: 90, status: 'PENDENTE_APROVACAO', user_id: 42, colaborador_id: 7,
    data_folga: '2026-10-29', minutos_solicitados: 60,
    motivo: 'Período: saída 1h mais cedo',
  };
  const { service, state } = fixture({ saldo: 120, programada: ocupado, registro });
  service.solicitarFolga({ user: { id: 42 }, data_folga: '2026-10-29', periodo_folga: 'SAIDA_ANTECIPADA' });
  assert.equal(state.inserted.exigeExcecao, 1);
  assert.throws(() => service.aprovarSolicitacao(90, { id: 1, role: 'ADMIN' }), /liberação excepcional/);
  assert.throws(() => service.aprovarSolicitacao(90, { id: 1, role: 'ADMIN' }, '', {
    autorizar_excecao: true, justificativa_excecao: 'curta',
  }), /liberação excepcional/);
  assert.throws(() => service.aprovarSolicitacao(90, { id: 8, role: 'MECANICO' }, '', {
    autorizar_excecao: true, justificativa_excecao: 'Necessidade urgente confirmada',
  }), /sem permissão/);
  assert.equal(service.aprovarSolicitacao(90, { id: 1, role: 'ADMIN' }, '', {
    autorizar_excecao: true, justificativa_excecao: 'Necessidade urgente confirmada',
  }), 55);
  assert.equal(state.approved.minutos_descontados, 60);
  assert.equal(state.updateArgs[3], 1);
  assert.equal(state.updateArgs[4], 1);
  assert.equal(state.updateArgs[5], 'Necessidade urgente confirmada');
});

test('segunda-feira continua proibida mesmo para exceção', () => {
  const { service } = fixture();
  assert.throws(() => service.solicitarFolga({
    user: { id: 42 }, data_folga: '2026-11-02', periodo_folga: 'SAIDA_ANTECIPADA',
  }), /Segunda-feira/);
});

test('migration libera pedidos concorrentes, preserva auditoria e integração não cria ausência integral para 1h', () => {
  const migration = read('database/migrations/237_escala_folga_uma_hora_excecoes.sql');
  const escala = read('modules/escala/escala.service.js');
  assert.match(migration, /DROP INDEX IF EXISTS uidx_escala_folga_solic_data_pendente/);
  assert.match(migration, /ADD COLUMN excecao_autorizada_por/);
  assert.match(migration, /ADD COLUMN justificativa_excecao/);
  assert.match(escala, /minutos < MINUTOS_DIA_FOLGA/);
  assert.match(escala, /minutos_descontados < 480/);
});

test('tela e rotas expõem aviso de ocupação e confirmação da gestão, sem ampliar acesso', () => {
  const self = read('views/escala/meu-painel.ejs');
  const manager = read('views/escala/folgas-programadas.ejs');
  const routes = read('modules/escala/escala.routes.js');
  assert.match(self, /ENTRADA_TARDIA/);
  assert.match(self, /SAIDA_ANTECIPADA/);
  assert.match(self, /folgas\/disponibilidade/);
  assert.match(manager, /autorizar_excecao/);
  assert.match(manager, /justificativa_excecao/);
  assert.match(manager, /conflito_dia/);
  assert.match(routes, /\/folgas\/disponibilidade[^\n]+maintenanceSelfRead/);
  assert.match(routes, /\/folgas\/solicitacoes\/:id\/aprovar[^\n]+escalaManage/);
});
