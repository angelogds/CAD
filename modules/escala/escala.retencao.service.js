const fs = require('node:fs');
const path = require('node:path');
const { normalizeRole, canAccessModule } = require('../../config/rbac');

function existe(db, tabela) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tabela));
}
function colunas(db, tabela) {
  return existe(db, tabela) ? db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name) : [];
}

// A exclusão é restrita à Escala. O perfil continua válido nos demais módulos.
function sqlVisibilidade(db, alias = 'c') {
  const cols = colunas(db, 'colaboradores');
  const p = alias ? `${alias}.` : '';
  const regras = [];
  if (cols.includes('fora_escala')) regras.push(`COALESCE(${p}fora_escala,0)=0`);
  if (existe(db, 'escala_colaboradores_exclusoes')) regras.push(`NOT EXISTS (SELECT 1 FROM escala_colaboradores_exclusoes removido WHERE removido.colaborador_id=${p}id)`);
  return regras.length ? regras.join(' AND ') : '1=1';
}
function disponivel(db, id) {
  return Boolean(db.prepare(`SELECT 1 FROM colaboradores c WHERE c.id=? AND ${sqlVisibilidade(db)}`).get(Number(id)));
}
function seisMesesDepois(instante) {
  const data = new Date(instante);
  const dia = data.getUTCDate();
  data.setUTCDate(1);
  data.setUTCMonth(data.getUTCMonth() + 6);
  const ultimo = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0)).getUTCDate();
  data.setUTCDate(Math.min(dia, ultimo));
  return data.toISOString();
}
function excluir(db, id, usuario, agora = new Date()) {
  if (!canAccessModule(normalizeRole(usuario?.role), 'escala_manage')) throw new Error('Perfil sem permissão para excluir da Escala.');
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('Colaborador inválido.');
  if (!db.prepare('SELECT id FROM colaboradores WHERE id=?').get(Number(id))) throw new Error('Colaborador não encontrado.');
  const instante = new Date(agora).toISOString();
  return db.transaction(() => {
    db.prepare('UPDATE colaboradores SET fora_escala=1 WHERE id=?').run(Number(id));
    db.prepare(`INSERT OR IGNORE INTO escala_colaboradores_exclusoes (colaborador_id,excluido_por,excluido_em,apagar_apos) VALUES (?,?,?,?)`)
      .run(Number(id), Number(usuario.id) || null, instante, seisMesesDepois(instante));
    for (const tabela of ['escala_rodizio_itens', 'escala_diurno_fixos']) {
      if (existe(db, tabela)) db.prepare(`UPDATE ${tabela} SET ativo=0 WHERE colaborador_id=?`).run(Number(id));
    }
    return db.prepare('SELECT excluido_em,apagar_apos FROM escala_colaboradores_exclusoes WHERE colaborador_id=?').get(Number(id));
  })();
}

// As tabelas são explícitas: nunca percorremos ou apagamos OS, estoque, perfis ou RH.
const TABELAS = ['escala_banco_horas_movimentos', 'escala_folga_solicitacoes', 'escala_concessoes',
  'escala_folgas_programadas', 'escala_compensacoes', 'escala_horas_extras', 'escala_adicional_noturno',
  'escala_alocacoes', 'escala_entries', 'escala_ausencias', 'escala_rodizio_itens', 'escala_diurno_fixos'];
const CHAVES_PESSOA = new Set(['colaborador_id', 'colaborador_folga_id', 'colaborador_fixo_id', 'parceiro_diogo_id', 'substituto_diogo_id']);
function limparSnapshot(valor, id) {
  if (Array.isArray(valor)) return valor.map(v => limparSnapshot(v, id)).filter(v => v !== null);
  if (!valor || typeof valor !== 'object') return valor;
  if (Object.entries(valor).some(([k, v]) => CHAVES_PESSOA.has(k) && Number(v) === id)) return null;
  return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limparSnapshot(v, id)]));
}
function limparAuditoria(db, id, idsPorTabela) {
  if (existe(db, 'escala_auditoria')) {
    for (const linha of db.prepare('SELECT id,entidade,entidade_id,antes_json,depois_json FROM escala_auditoria').all()) {
      if (idsPorTabela.get(linha.entidade)?.has(Number(linha.entidade_id))) {
        db.prepare('DELETE FROM escala_auditoria WHERE id=?').run(linha.id);
        continue;
      }
      const valores = ['antes_json','depois_json'].map(c => {
        if (!linha[c]) return linha[c];
        try { return JSON.stringify(limparSnapshot(JSON.parse(linha[c]), id)); } catch (_) { return linha[c]; }
      });
      if (valores[0] === 'null' || valores[1] === 'null') db.prepare('DELETE FROM escala_auditoria WHERE id=?').run(linha.id);
      else db.prepare('UPDATE escala_auditoria SET antes_json=?,depois_json=? WHERE id=?').run(...valores, linha.id);
    }
  }
  if (existe(db, 'escala_alteracoes_historico')) {
    for (const linha of db.prepare('SELECT id,escala_anterior,nova_escala FROM escala_alteracoes_historico').all()) {
      const valores = ['escala_anterior','nova_escala'].map(c => {
        if (!linha[c]) return linha[c];
        try { return JSON.stringify(limparSnapshot(JSON.parse(linha[c]), id)); } catch (_) { return linha[c]; }
      });
      db.prepare('UPDATE escala_alteracoes_historico SET escala_anterior=?,nova_escala=? WHERE id=?').run(...valores, linha.id);
    }
  }
}
function arquivoReferenciado(db, arquivo) {
  return ['escala_horas_extras','escala_folgas_programadas','escala_compensacoes'].some(tabela => {
    const cols = colunas(db, tabela).filter(c => /(?:foto.*_path|anexo_path)$/.test(c));
    return cols.length && db.prepare(`SELECT 1 FROM ${tabela} WHERE ${cols.map(c => `${c}=?`).join(' OR ')} LIMIT 1`).get(...cols.map(() => arquivo));
  });
}
function purgarVencidos(db, { agora = new Date(), uploadDir } = {}) {
  if (!existe(db, 'escala_colaboradores_exclusoes')) return { purgados: 0, arquivosPendentes: 0 };
  const instante = new Date(agora).toISOString();
  const vencidos = db.prepare('SELECT * FROM escala_colaboradores_exclusoes WHERE purgado_em IS NULL AND apagar_apos<=?').all(instante);
  for (const excluido of vencidos) db.transaction(() => {
    const id = Number(excluido.colaborador_id);
    const arquivos = new Set();
    const idsPorTabela = new Map();
    for (const tabela of TABELAS) {
      if (!existe(db, tabela)) continue;
      const rows = db.prepare(`SELECT * FROM ${tabela} WHERE colaborador_id=?`).all(id);
      idsPorTabela.set(tabela, new Set(rows.map(r => Number(r.id))));
      for (const row of rows) for (const [k,v] of Object.entries(row)) {
        if (/(?:foto.*_path|anexo_path)$/.test(k) && v) arquivos.add(v);
      }
      db.prepare(`DELETE FROM ${tabela} WHERE colaborador_id=?`).run(id);
    }
    if (existe(db, 'escala_folgas_sabado')) {
      const chaves = colunas(db, 'escala_folgas_sabado').filter(c => CHAVES_PESSOA.has(c));
      if (chaves.length) db.prepare(`DELETE FROM escala_folgas_sabado WHERE ${chaves.map(c => `${c}=?`).join(' OR ')}`).run(...chaves.map(() => id));
    }
    limparAuditoria(db, id, idsPorTabela);
    db.prepare('UPDATE escala_colaboradores_exclusoes SET purgado_em=?,arquivos_pendentes=? WHERE colaborador_id=?').run(instante, JSON.stringify([...arquivos]), id);
  })();

  // Arquivos só saem depois do commit; falhas são tentadas de novo no próximo ciclo.
  const raiz = path.resolve(uploadDir || require('../../config/storage').UPLOAD_DIR, 'escala-horas');
  let arquivosPendentes = 0;
  for (const linha of db.prepare("SELECT colaborador_id,arquivos_pendentes FROM escala_colaboradores_exclusoes WHERE purgado_em IS NOT NULL AND arquivos_pendentes<>'[]'").all()) {
    const pendentes = [];
    for (const arquivo of JSON.parse(linha.arquivos_pendentes)) {
      if (arquivoReferenciado(db, arquivo)) continue;
      if (!/^\/uploads\/escala-horas\/[^/\\]+$/.test(arquivo)) continue;
      const destino = path.resolve(raiz, path.basename(arquivo));
      if (path.dirname(destino) !== raiz) continue;
      try { fs.unlinkSync(destino); } catch (e) { if (e.code !== 'ENOENT') pendentes.push(arquivo); }
    }
    arquivosPendentes += pendentes.length;
    db.prepare('UPDATE escala_colaboradores_exclusoes SET arquivos_pendentes=? WHERE colaborador_id=?').run(JSON.stringify(pendentes), linha.colaborador_id);
  }
  return { purgados: vencidos.length, arquivosPendentes };
}
module.exports = { sqlVisibilidade, disponivel, seisMesesDepois, excluir, purgarVencidos };
