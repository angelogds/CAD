let db;

try {
  db = require('../../database/db');
} catch (_e) {}
try {
  if (!db) db = require('../../database');
} catch (_e) {}
try {
  if (!db) db = require('../../db');
} catch (_e) {}

function safeAll(sql, params = []) {
  try {
    if (!db || !db.prepare) return [];
    return db.prepare(sql).all(params);
  } catch (err) {
    console.warn('[TV] safeAll fallback:', err.message);
    return [];
  }
}

function safeGet(sql, params = []) {
  try {
    if (!db || !db.prepare) return null;
    return db.prepare(sql).get(params);
  } catch (err) {
    console.warn('[TV] safeGet fallback:', err.message);
    return null;
  }
}

function tableExists(name) {
  const row = safeGet("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name]);
  return !!row;
}

function firstTable(names) {
  return names.find(tableExists);
}

function columns(table) {
  if (!table) return [];
  return safeAll(`PRAGMA table_info(${table})`).map((c) => c.name);
}

function pickCol(table, candidates, fallbackSql = 'NULL') {
  const cols = columns(table);
  const found = candidates.find((c) => cols.includes(c));
  return found || fallbackSql;
}

function resolvePhotoPath(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) return value;
  if (value.startsWith('uploads/')) return `/${value}`;
  return `/uploads/users/${value}`;
}

function normalizarStatusOS(status) {
  const s = String(status || '').toUpperCase().trim();
  if (['ABERTA', 'ABERTO', 'PENDENTE', 'NOVA'].includes(s)) return 'ABERTA';
  if (['EM_ANDAMENTO', 'ANDAMENTO', 'EXECUTANDO', 'EM EXECUÇÃO', 'EM_EXECUCAO'].includes(s)) return 'EM_ANDAMENTO';
  if (['PAUSADA', 'PAUSADO', 'AGUARDANDO', 'AGUARDANDO_PECA', 'AGUARDANDO PEÇA'].includes(s)) return 'PAUSADA';
  if (['CONCLUIDA', 'CONCLUÍDA', 'FINALIZADA', 'FECHADA'].includes(s)) return 'CONCLUIDA';
  return 'ABERTA';
}

function normalizarPrioridade(prioridade) {
  const s = String(prioridade || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['CRITICA', 'CRITICO'].includes(s)) return 'CRITICA';
  if (s === 'ALTA') return 'ALTA';
  if (s === 'MEDIA') return 'MEDIA';
  return 'BAIXA';
}

function tempoDesde(dateValue) {
  if (!dateValue) return '-';
  const start = new Date(dateValue);
  if (Number.isNaN(start.getTime())) return '-';

  const diffMin = Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000));
  if (diffMin < 60) return `${diffMin} min`;

  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;

  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

async function getOS() {
  const table = firstTable(['ordens_servico', 'os', 'ordens', 'ordens_de_servico']);
  if (!table) return fallbackOS();

  const id = pickCol(table, ['id']);
  const numero = pickCol(table, ['numero', 'codigo', 'n_os'], 'id');
  const equipamento = pickCol(table, ['equipamento_nome', 'equipamento', 'maquina', 'ativo'], "'Equipamento não informado'");
  const responsavel = pickCol(table, ['responsavel_nome', 'responsavel', 'mecanico_nome', 'atribuido_para'], "'A definir'");
  const responsavelId = pickCol(table, ['responsavel_id', 'mecanico_id', 'usuario_responsavel_id'], 'NULL');
  const status = pickCol(table, ['status', 'situacao'], "'ABERTA'");
  const prioridade = pickCol(table, ['prioridade', 'criticidade'], "'MEDIA'");
  const descricao = pickCol(table, ['descricao', 'problema', 'observacao', 'solicitacao'], "''");
  const created = pickCol(table, ['created_at', 'criado_em', 'data_abertura', 'abertura_em'], 'NULL');

  const rows = safeAll(`
    SELECT
      ${id} AS id,
      ${numero} AS numero,
      ${equipamento} AS equipamento,
      ${responsavel} AS responsavel,
      ${responsavelId} AS responsavel_id,
      ${status} AS status,
      ${prioridade} AS prioridade,
      ${descricao} AS descricao,
      ${created} AS created_at
    FROM ${table}
    ORDER BY id DESC
    LIMIT 30
  `);

  if (!rows.length) return fallbackOS();

  return rows.map((r, index) => {
    const statusNorm = normalizarStatusOS(r.status);
    const prioridadeNorm = normalizarPrioridade(r.prioridade);

    return {
      id: r.id,
      numero: String(r.numero || r.id).startsWith('OS') ? String(r.numero) : `OS #${r.numero || r.id}`,
      equipamento: String(r.equipamento || 'Equipamento não informado').toUpperCase(),
      responsavel: r.responsavel || 'A definir',
      responsavel_id: r.responsavel_id || null,
      status: statusNorm,
      prioridade: prioridadeNorm,
      tempo: tempoDesde(r.created_at),
      descricao: r.descricao || '',
      isNew: index === 0 && statusNorm === 'ABERTA',
    };
  });
}

async function getMecanicos() {
  const table = firstTable(['users', 'usuarios', 'colaboradores']);
  if (!table) return fallbackMecanicos();

  const id = pickCol(table, ['id']);
  const nome = pickCol(table, ['nome', 'name', 'usuario'], "'Colaborador'");
  const funcao = pickCol(table, ['funcao', 'cargo', 'role'], "'Mecânico'");
  const foto = pickCol(table, ['foto', 'avatar', 'photo_url', 'imagem', 'photo_path'], 'NULL');
  const ativo = pickCol(table, ['ativo', 'is_active'], '1');

  const rows = safeAll(`
    SELECT
      ${id} AS id,
      ${nome} AS nome,
      ${funcao} AS funcao,
      ${foto} AS foto
    FROM ${table}
    WHERE COALESCE(${ativo}, 1) = 1
    ORDER BY nome ASC
    LIMIT 12
  `);

  if (!rows.length) return fallbackMecanicos();

  const colaboradores = tableExists('colaboradores')
    ? safeAll('SELECT user_id, foto_url, nome, funcao FROM colaboradores WHERE COALESCE(ativo, 1) = 1')
    : [];
  const byUserId = new Map();
  colaboradores.forEach((c) => {
    const userId = Number(c?.user_id || 0);
    if (!userId) return;
    byUserId.set(userId, c);
  });

  return rows.map((r, index) => {
    const colab = byUserId.get(Number(r.id));
    const photoFromId = colab?.foto_url || null;
    const fotoResolvida = resolvePhotoPath(r.foto || photoFromId || '');

    return {
      id: r.id,
      nome: r.nome || colab?.nome || `Colaborador #${r.id}`,
      funcao: r.funcao || colab?.funcao || 'Mecânico',
      foto: fotoResolvida || '/IMG/logo_menu.png.png',
      status: index % 5 === 0 ? 'ativo' : 'online',
      turno: 'Turno vigente',
      osConcluidas: 0,
      tempoMedio: 0,
    };
  });
}

async function getPreventivas() {
  const table = firstTable(['preventivas', 'manutencoes_preventivas', 'preventive_tasks', 'preventiva_execucoes']);
  if (!table) return fallbackPreventivas();

  const id = pickCol(table, ['id']);
  const tarefa = pickCol(table, ['tarefa', 'titulo', 'descricao', 'plano_nome'], "'Preventiva'");
  const equipamento = pickCol(table, ['equipamento_nome', 'equipamento', 'ativo', 'equipamento_tag'], "'Equipamento'");
  const data = pickCol(table, ['data_prevista', 'proxima_execucao', 'data_programada', 'vencimento'], 'NULL');
  const status = pickCol(table, ['status', 'situacao'], "'PENDENTE'");
  const responsavel = pickCol(table, ['responsavel_nome', 'responsavel', 'mecanico'], "'A definir'");

  const rows = safeAll(`
    SELECT
      ${id} AS id,
      ${tarefa} AS tarefa,
      ${equipamento} AS equipamento,
      ${data} AS dataPrevista,
      ${status} AS status,
      ${responsavel} AS responsavel
    FROM ${table}
    ORDER BY COALESCE(${data}, CURRENT_TIMESTAMP) ASC
    LIMIT 30
  `);

  if (!rows.length) return fallbackPreventivas();

  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const raw = String(r.status || '').toUpperCase();
    let st = 'PENDENTE';
    if (raw.includes('CONCL')) st = 'CONCLUIDA';
    else if (raw.includes('ATRAS')) st = 'ATRASADA';
    else if (raw.includes('PRAZO')) st = 'NO_PRAZO';

    if (r.dataPrevista && String(r.dataPrevista).slice(0, 10) < today && st !== 'CONCLUIDA') {
      st = 'ATRASADA';
    }

    return {
      id: r.id,
      tarefa: r.tarefa,
      equipamento: r.equipamento,
      dataPrevista: r.dataPrevista ? String(r.dataPrevista).slice(0, 10) : today,
      status: st,
      responsavel: r.responsavel || 'A definir',
    };
  });
}

async function getGaleria() {
  if (tableExists('os_fechamento_fotos')) {
    const rows = safeAll(`
      SELECT id, os_id, imagem_url, legenda, created_at
      FROM os_fechamento_fotos
      ORDER BY created_at DESC
      LIMIT 8
    `);

    if (rows.length) {
      return rows.map((r) => ({
        id: r.id,
        imagem_url: r.imagem_url,
        legenda: r.legenda || `Fechamento da OS #${r.os_id}`,
        os_numero: `OS #${r.os_id}`,
        equipamento: 'Equipamento',
        created_at: r.created_at,
      }));
    }
  }

  return [{
    id: 1,
    imagem_url: '/img/login/slideshow/publicimglogin-bg.jpg.jpeg',
    legenda: 'Galeria de fechamento de OS — aguardando fotos reais',
    os_numero: 'OS',
    equipamento: 'Manutenção',
    created_at: new Date().toISOString(),
  }];
}

async function getWeather() {
  return {
    cidade: 'Feira de Santana',
    temp: '--',
    umidade: '--',
    vento: '--',
    condicao: 'Previsão será finalizada na Parte 2',
    previsao: [],
    updatedAt: new Date().toISOString(),
  };
}

function getAlertas(osList, preventivas) {
  const alertas = [];

  osList.filter((o) => o.prioridade === 'CRITICA' && o.status !== 'CONCLUIDA').slice(0, 5).forEach((o) => {
    alertas.push({
      id: Number(o.id),
      tipo: 'CRITICO',
      titulo: `${o.numero} - ${o.equipamento}`,
      descricao: o.descricao || 'OS crítica em aberto',
      timestamp: o.tempo,
      reconhecido: false,
    });
  });

  preventivas.filter((p) => p.status === 'ATRASADA').slice(0, 5).forEach((p) => {
    alertas.push({
      id: 100000 + Number(p.id),
      tipo: 'MEDIO',
      titulo: 'Preventiva atrasada',
      descricao: `${p.tarefa} — ${p.equipamento}`,
      timestamp: 'Atrasada',
      reconhecido: false,
    });
  });

  return alertas;
}

function getPerformance(osList) {
  const abertas = osList.filter((o) => o.status !== 'CONCLUIDA').length;
  const concluidas = osList.filter((o) => o.status === 'CONCLUIDA').length;
  const criticas = osList.filter((o) => o.prioridade === 'CRITICA' && o.status !== 'CONCLUIDA').length;
  return { abertas, concluidas, criticas, total: osList.length };
}

function getTicker(osList, preventivas) {
  const msgs = [];

  osList.slice(0, 6).forEach((o) => {
    msgs.push({
      id: `os-${o.id}`,
      tipo: o.prioridade === 'CRITICA' ? 'nova_os' : 'manutencao',
      texto: `${o.numero} • ${o.equipamento} • ${o.status} • Responsável: ${o.responsavel}`,
      criticidade: o.prioridade,
    });
  });

  preventivas.filter((p) => p.status === 'ATRASADA').slice(0, 3).forEach((p) => {
    msgs.push({
      id: `prev-${p.id}`,
      tipo: 'aviso',
      texto: `Preventiva atrasada • ${p.equipamento} • ${p.responsavel}`,
      criticidade: 'MEDIA',
    });
  });

  if (!msgs.length) {
    msgs.push({
      id: 'ok',
      tipo: 'aviso',
      texto: 'Sistema de manutenção operacional • Sem alertas críticos no momento',
      criticidade: 'BAIXA',
    });
  }

  return msgs;
}

async function getSnapshot(user) {
  const [os, mecanicos, preventivas, galeria, weather] = await Promise.all([
    getOS(),
    getMecanicos(),
    getPreventivas(),
    getGaleria(),
    getWeather(),
  ]);

  return {
    os,
    mecanicos,
    preventivas,
    galeria,
    weather,
    alertas: getAlertas(os, preventivas),
    performance: getPerformance(os),
    ticker: getTicker(os, preventivas),
    system: {
      online: true,
      user: user
        ? {
            id: user.id,
            nome: user.nome || user.name || user.email,
          }
        : null,
    },
  };
}

async function reconhecerAlerta(_id, _user) {
  return true;
}

function fallbackOS() {
  return [
    { id: 102, numero: 'OS #102', equipamento: 'PRENSA P50', responsavel: 'Fábio', status: 'ABERTA', prioridade: 'CRITICA', tempo: '15 min', descricao: 'Falha crítica aguardando intervenção', isNew: true },
    { id: 98, numero: 'OS #98', equipamento: 'DIGESTOR 1', responsavel: 'Diogo', status: 'EM_ANDAMENTO', prioridade: 'ALTA', tempo: '2h 30min', descricao: 'Serviço em andamento' },
    { id: 91, numero: 'OS #91', equipamento: 'TRANSPORTADOR T10', responsavel: 'Carlos', status: 'PAUSADA', prioridade: 'ALTA', tempo: '1h 45min', descricao: 'Aguardando peças' },
  ];
}

function fallbackMecanicos() {
  return [
    { id: 1, nome: 'Fábio', funcao: 'Mecânico', foto: '/IMG/logo_menu.png.png', status: 'online', turno: 'Turno vigente', osConcluidas: 0, tempoMedio: 0 },
    { id: 2, nome: 'Diogo', funcao: 'Mecânico', foto: '/IMG/logo_menu.png.png', status: 'ativo', turno: 'Turno vigente', osConcluidas: 0, tempoMedio: 0 },
    { id: 3, nome: 'Salviano', funcao: 'Mecânico', foto: '/IMG/logo_menu.png.png', status: 'online', turno: 'Turno vigente', osConcluidas: 0, tempoMedio: 0 },
    { id: 4, nome: 'Luiz', funcao: 'Auxiliar', foto: '/IMG/logo_menu.png.png', status: 'online', turno: 'Turno vigente', osConcluidas: 0, tempoMedio: 0 },
  ];
}

function fallbackPreventivas() {
  const today = new Date().toISOString().slice(0, 10);
  return [
    { id: 1, tarefa: 'Lubrificação geral', equipamento: 'PRENSA P50', dataPrevista: today, status: 'PENDENTE', responsavel: 'Fábio' },
    { id: 2, tarefa: 'Inspeção de válvulas', equipamento: 'DIGESTOR 1', dataPrevista: today, status: 'NO_PRAZO', responsavel: 'Diogo' },
  ];
}

module.exports = {
  getSnapshot,
  getWeather,
  reconhecerAlerta,
};
