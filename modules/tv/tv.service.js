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

const DEFAULT_AVATAR = '/IMG/login_campo_do_gado.png.png.png';
const MAINT_FALLBACK = [
  { nome: 'Diogo', grupo: 'MECANICO', funcao: 'Mecânico' },
  { nome: 'Salviano', grupo: 'MECANICO', funcao: 'Mecânico' },
  { nome: 'Rodolfo', grupo: 'MECANICO', funcao: 'Mecânico' },
  { nome: 'Fábio', grupo: 'MECANICO', funcao: 'Mecânico' },
  { nome: 'Júnior', grupo: 'APOIO_OPERACIONAL', funcao: 'Apoio Operacional' },
  { nome: 'Luís', grupo: 'APOIO_OPERACIONAL', funcao: 'Auxiliar' },
  { nome: 'Emanuel', grupo: 'APOIO_OPERACIONAL', funcao: 'Auxiliar' },
];

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

function hasAny(raw, patterns = []) {
  const s = String(raw || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return patterns.some((p) => s.includes(p));
}

function normalizeImagePath(value) {
  if (!value) return DEFAULT_AVATAR;

  const v = String(value).trim();
  if (!v) return DEFAULT_AVATAR;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  if (v.startsWith('/')) return v;
  if (v.startsWith('uploads/')) return `/${v}`;
  if (v.startsWith('public/')) return v.replace(/^public/, '');

  return `/uploads/${v.replace(/^\/+/, '')}`;
}

function normalizeNome(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function classificarGrupo(colaborador = {}) {
  const base = `${colaborador?.funcao || ''} ${colaborador?.role || ''} ${colaborador?.perfil || ''} ${colaborador?.grupo || ''} ${colaborador?.tipo || ''}`;
  if (hasAny(base, ['APOIO', 'OPERACIONAL', 'AUXILIAR'])) return 'APOIO_OPERACIONAL';
  return 'MECANICO';
}

function normalizarRankingItem(item, index) {
  return {
    user_id: Number(item.user_id || item.id || 0) || null,
    nome: item.nome || item.name || `Colaborador ${index + 1}`,
    os_finalizadas: Number(item.os_total || item.total || 0),
    criticas: Number(item.os_criticas || item.criticas || 0),
    altas: Number(item.os_altas || item.altas || 0),
    pontos: Number(item.score || item.pontuacao || item.pontos || 0),
    posicao: Number(item.posicao || index + 1),
    foto: normalizeImagePath(item.photo_path || item.foto || item.avatar || item.imagem),
    grupo: String(item.perfil || '').toLowerCase() === 'apoio' ? 'APOIO_OPERACIONAL' : 'MECANICO',
  };
}

async function getDadosPainelOperacionalParaTV() {
  let painelService = null;

  try {
    painelService = require('../dashboard/dashboard.service');
  } catch (_) {}
  try {
    if (!painelService) painelService = require('../painel/painel.service');
  } catch (_) {}
  try {
    if (!painelService) painelService = require('../painel-operacional/painel.service');
  } catch (_) {}

  if (!painelService) return null;

  const escalaRaw =
    (typeof painelService.getEscalaPainelSemana === 'function' ? painelService.getEscalaPainelSemana() : null) ||
    (typeof painelService.getEscalaSemana === 'function' ? painelService.getEscalaSemana() : null) ||
    null;
  const rankingRaw = typeof painelService.getMecanicosRankingSemana === 'function' ? painelService.getMecanicosRankingSemana() : null;

  return { escalaRaw, rankingRaw };
}

function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
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
    LIMIT 50
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

function extractEscalaVigenteFromTable(table) {
  const cols = columns(table);
  if (!cols.length) return { equipe: [], escalaVigente: { diaMecanicos: [], apoioOperacional: [], noiteResponsavel: [], folgaAtestado: [], ferias: [] } };

  const nomeCol = pickCol(table, ['nome', 'name', 'usuario_nome', 'colaborador_nome', 'funcionario_nome'], "''");
  const funcaoCol = pickCol(table, ['funcao', 'cargo', 'perfil', 'papel'], "''");
  const turnoCol = pickCol(table, ['turno', 'periodo', 'shift'], "''");
  const statusCol = pickCol(table, ['status', 'situacao', 'estado'], "''");
  const fotoCol = pickCol(table, ['foto', 'avatar', 'photo_url', 'foto_url', 'imagem'], 'NULL');
  const idCol = pickCol(table, ['id', 'usuario_id', 'user_id', 'colaborador_id'], 'rowid');
  const dataCol = pickCol(table, ['data', 'dia', 'data_escala', 'created_at', 'data_referencia'], 'NULL');

  const today = new Date().toISOString().slice(0, 10);
  const hasData = !['NULL', "''"].includes(dataCol);

  const rows = safeAll(`
    SELECT
      ${idCol} AS id,
      ${nomeCol} AS nome,
      ${funcaoCol} AS funcao,
      ${turnoCol} AS turno,
      ${statusCol} AS status,
      ${fotoCol} AS foto,
      ${hasData ? dataCol : 'NULL'} AS data_escala
    FROM ${table}
    ${hasData ? `WHERE date(${dataCol}) = date('${today}') OR ${dataCol} IS NULL` : ''}
    ORDER BY id DESC
    LIMIT 80
  `);

  const escalaVigente = { dia: [], apoio: [], noite: [], folga: [], ferias: [] };
  const equipe = [];

  rows.forEach((r) => {
    const nome = String(r.nome || '').trim();
    if (!nome) return;

    const base = `${r.funcao || ''} ${r.status || ''} ${r.turno || ''}`;
    if (!hasAny(base, ['MECAN', 'MANUTEN', 'AUXILIAR', 'APOIO OPERACIONAL'])) return;
    if (hasAny(base, ['ADMIN', 'GERENTE', 'RH', 'FINANCEIRO'])) return;

    let grupo = hasAny(base, ['AUXILIAR', 'APOIO OPERACIONAL']) ? 'APOIO_OPERACIONAL' : 'MECANICO';
    let st = 'online';
    const tag = `${r.status || ''} ${r.turno || ''}`;
    if (hasAny(tag, ['EM OS', 'EM_ANDAMENTO', 'ATENDIMENTO'])) st = 'em_os';
    if (hasAny(tag, ['FOLGA'])) st = 'folga';
    if (hasAny(tag, ['FERIAS'])) st = 'ferias';
    if (hasAny(tag, ['ATESTADO'])) st = 'atestado';

    let turno = 'Turno vigente';
    if (hasAny(tag, ['NOITE'])) turno = 'Noite';
    if (hasAny(tag, ['DIA'])) turno = 'Dia';

    const row = {
      id: r.id,
      nome,
      funcao: String(r.funcao || (grupo === 'MECANICO' ? 'Mecânico' : 'Apoio Operacional')),
      grupo,
      foto: normalizeImagePath(r.foto),
      status: st,
      turno,
      osAtual: null,
      totalOsConcluidas: 0,
      tempoMedio: '-',
    };

    equipe.push(row);
    if (st === 'folga' || st === 'atestado') escalaVigente.folga.push(nome);
    else if (st === 'ferias') escalaVigente.ferias.push(nome);
    else if (turno === 'Noite') escalaVigente.noite.push(nome);
    else if (grupo === 'APOIO_OPERACIONAL') escalaVigente.apoio.push(nome);
    else escalaVigente.dia.push(nome);
  });

  return {
    equipe,
    escalaVigente: {
      diaMecanicos: escalaVigente.dia,
      apoioOperacional: escalaVigente.apoio || [],
      noiteResponsavel: escalaVigente.noite,
      folgaAtestado: escalaVigente.folga.map((nome) => ({ nome, status: 'FOLGA' })),
      ferias: escalaVigente.ferias.map((nome) => ({ nome, status: 'FERIAS' })),
    },
  };
}

function fillEquipeStats(equipe, osList) {
  return equipe.map((p) => {
    const emAberto = osList.find((o) => String(o.responsavel || '').toUpperCase() === String(p.nome).toUpperCase() && o.status !== 'CONCLUIDA');
    const concluidas = osList.filter((o) => String(o.responsavel || '').toUpperCase() === String(p.nome).toUpperCase() && o.status === 'CONCLUIDA').length;
    return {
      ...p,
      status: p.status === 'online' && emAberto ? 'em_os' : p.status,
      osAtual: emAberto ? emAberto.numero : null,
      totalOsConcluidas: concluidas,
    };
  });
}

async function getEquipeManutencaoViaEscala(osList = []) {
  const painelData = await getDadosPainelOperacionalParaTV();
  const escalaPainel = painelData?.escalaRaw;
  const rankingPainel = painelData?.rankingRaw || {};

  if (escalaPainel && typeof escalaPainel === 'object') {
    const equipeMap = new Map();
    const addPessoa = (pessoa, grupo, status = 'online', turno = 'Dia') => {
      const nome = String(pessoa?.nome || pessoa || '').trim();
      if (!nome) return;
      const key = normalizeNome(nome);
      if (!key) return;
      if (equipeMap.has(key)) return;
      equipeMap.set(key, {
        id: Number(pessoa?.user_id || pessoa?.id || 0) || null,
        nome,
        funcao: grupo === 'APOIO_OPERACIONAL' ? 'Apoio Operacional' : 'Mecânico',
        grupo,
        foto: normalizeImagePath(pessoa?.photo_path || pessoa?.foto || pessoa?.avatar || pessoa?.imagem),
        status,
        turno,
        osAtual: null,
        totalOsConcluidas: 0,
        tempoMedio: '-',
      });
    };

    (escalaPainel.diurno_mecanicos || []).forEach((p) => addPessoa(p, 'MECANICO', 'online', 'Dia'));
    (escalaPainel.apoio_operacional || []).forEach((p) => addPessoa(p, 'APOIO_OPERACIONAL', 'online', 'Dia'));
    (escalaPainel.noturno || []).forEach((p) => addPessoa(p, classificarGrupo(p), 'online', 'Noite'));
    (escalaPainel.folgas_afastamentos || []).forEach((p) => addPessoa(p, classificarGrupo(p), hasAny(p.tipo, ['FERIAS']) ? 'ferias' : hasAny(p.tipo, ['ATESTADO']) ? 'atestado' : 'folga', 'Dia'));

    const rankingRef = [...(rankingPainel.itemsMecanicos || []), ...(rankingPainel.itemsApoio || [])];
    rankingRef.forEach((item) => {
      const key = normalizeNome(item.nome);
      const atual = equipeMap.get(key);
      if (!atual) return;
      atual.id = atual.id || Number(item.user_id || 0) || null;
      atual.foto = normalizeImagePath(item.photo_path || atual.foto);
    });

    const equipe = fillEquipeStats(Array.from(equipeMap.values()), osList);
    const folgas = (escalaPainel.folgas_afastamentos || []).map((f) => ({
      nome: String(f.nome || '').trim(),
      status: String(f.tipo || '-').toUpperCase(),
    })).filter((f) => f.nome);

    return {
      equipe,
      escalaVigente: {
        diaMecanicos: (escalaPainel.diurno_mecanicos || []).map((p) => p.nome).filter(Boolean),
        apoioOperacional: (escalaPainel.apoio_operacional || []).map((p) => p.nome).filter(Boolean),
        noiteResponsavel: (escalaPainel.noturno || []).map((p) => p.nome).filter(Boolean),
        folgaAtestado: folgas,
        ferias: folgas.filter((f) => hasAny(f.status, ['FERIAS'])),
      },
    };
  }

  const escalaTables = ['escala', 'escalas', 'escala_dias', 'escala_colaboradores', 'escala_manutencao', 'turnos'];

  for (const t of escalaTables) {
    if (!tableExists(t)) continue;
    const parsed = extractEscalaVigenteFromTable(t);
    if (parsed.equipe.length) {
      return { ...parsed, equipe: fillEquipeStats(parsed.equipe, osList) };
    }
  }

  const equipeFallback = MAINT_FALLBACK.map((p, idx) => ({
    id: idx + 1,
    nome: p.nome,
    funcao: p.funcao,
    grupo: p.grupo,
    foto: DEFAULT_AVATAR,
    status: 'online',
    turno: 'Turno vigente',
    osAtual: null,
    totalOsConcluidas: 0,
    tempoMedio: '-',
  }));

  return {
    equipe: fillEquipeStats(equipeFallback, osList),
    escalaVigente: {
      diaMecanicos: equipeFallback.filter((e) => e.grupo === 'MECANICO').map((e) => e.nome),
      apoioOperacional: equipeFallback.filter((e) => e.grupo === 'APOIO_OPERACIONAL').map((e) => e.nome),
      noiteResponsavel: [],
      folgaAtestado: [],
      ferias: [],
    },
  };
}

async function getEscalaVigente(osList = []) {
  const result = await getEquipeManutencaoViaEscala(osList);
  return result.escalaVigente;
}

async function getRankingEquipe(osList = [], equipe = []) {
  const painelData = await getDadosPainelOperacionalParaTV();
  const rankingRaw = painelData?.rankingRaw || {};
  const rankingMecanicos = (rankingRaw.itemsMecanicos || rankingRaw.items || []).map(normalizarRankingItem);
  const rankingApoio = (rankingRaw.itemsApoio || []).map(normalizarRankingItem);

  if (rankingMecanicos.length || rankingApoio.length) {
    return {
      rankingMecanicos,
      rankingApoio,
      mensagem: '',
    };
  }

  const fallback = equipe.slice(0, 8).map((p, index) => ({
    user_id: p.id || null,
    nome: p.nome,
    os_finalizadas: Number(p.totalOsConcluidas || 0),
    criticas: 0,
    altas: 0,
    pontos: Number(p.totalOsConcluidas || 0),
    posicao: index + 1,
    foto: normalizeImagePath(p.foto),
    grupo: p.grupo || 'MECANICO',
  }));

  return {
    rankingMecanicos: fallback.filter((f) => f.grupo === 'MECANICO'),
    rankingApoio: fallback.filter((f) => f.grupo === 'APOIO_OPERACIONAL'),
    mensagem: 'Ranking será exibido após novos fechamentos de OS.',
  };
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

function getGaleriaFromTable(table) {
  const id = pickCol(table, ['id']);
  const osId = pickCol(table, ['os_id', 'ordem_servico_id', 'ordem_id'], 'NULL');
  const arquivo = pickCol(table, ['imagem_url', 'arquivo_url', 'url', 'caminho', 'path', 'filename', 'caminho_arquivo', 'filepath'], 'NULL');
  const tipo = pickCol(table, ['tipo', 'mime_type', 'mimetype', 'origem'], "''");
  const legenda = pickCol(table, ['descricao', 'legenda', 'observacao', 'titulo'], "''");
  const created = pickCol(table, ['created_at', 'criado_em', 'data_criacao'], 'CURRENT_TIMESTAMP');
  const respId = pickCol(table, ['responsavel_id', 'usuario_id'], 'NULL');

  const rows = safeAll(`
    SELECT
      ${id} id,
      ${osId} os_id,
      ${arquivo} arquivo,
      ${tipo} tipo,
      ${legenda} legenda,
      ${created} created_at,
      ${respId} responsavel_id
    FROM ${table}
    WHERE COALESCE(${arquivo}, '') <> ''
    ORDER BY datetime(${created}) DESC
    LIMIT 30
  `);

  return rows
    .filter((r) => r.arquivo)
    .map((r) => {
      const rawUrl = String(r.arquivo || '');
      const lower = rawUrl.toLowerCase();
      const mime = String(r.tipo || '').toLowerCase();
      const isVideo = mime.includes('video') || /\.(mp4|webm|ogg|mov)$/i.test(lower);
      const src = normalizeImagePath(rawUrl);
      return {
        id: `${table}-${r.id}`,
        arquivo_url: src,
        tipo: isVideo ? 'video' : 'image',
        legenda: r.legenda || `Fechamento da OS #${r.os_id || '-'}`,
        os_numero: `OS #${r.os_id || '-'}`,
        equipamento: 'Manutenção',
        created_at: r.created_at,
        responsavel: r.responsavel_id ? `ID ${r.responsavel_id}` : 'A definir',
      };
    });
}

async function getGaleria() {
  const tables = ['os_fechamento_midias', 'os_fechamento_fotos', 'os_anexos', 'anexos_os', 'ordem_servico_anexos', 'os_fechamentos', 'fechamentos_os', 'arquivos_os', 'os_midias'];
  let itens = [];
  tables.forEach((t) => {
    if (tableExists(t)) itens = itens.concat(getGaleriaFromTable(t));
  });

  if (tableExists('anexos')) {
    const ownerType = pickCol('anexos', ['owner_type', 'ownerType', 'tipo_dono'], "'os'");
    const ownerId = pickCol('anexos', ['owner_id', 'ownerId'], 'NULL');
    const filepath = pickCol('anexos', ['filepath', 'path', 'arquivo_url', 'url'], 'NULL');
    const filename = pickCol('anexos', ['filename', 'nome_arquivo'], "''");
    const created = pickCol('anexos', ['uploaded_at', 'created_at'], 'CURRENT_TIMESTAMP');
    const mime = pickCol('anexos', ['mime_type', 'mimetype'], "''");
    const rows = safeAll(`
      SELECT id, ${ownerId} os_id, COALESCE(${filepath}, ${filename}) arquivo, ${mime} tipo, '' legenda, ${created} created_at, NULL responsavel_id
      FROM anexos
      WHERE lower(COALESCE(${ownerType}, '')) = 'os'
      ORDER BY datetime(${created}) DESC
      LIMIT 20
    `);
    itens = itens.concat(rows.map((r) => ({
      id: `anexos-${r.id}`,
      arquivo_url: normalizeImagePath(r.arquivo),
      tipo: String(r.tipo || '').toLowerCase().includes('video') || /\.(mp4|webm|mov)$/i.test(String(r.arquivo || '')) ? 'video' : 'image',
      legenda: 'Fechamento da OS',
      os_numero: `OS #${r.os_id || '-'}`,
      equipamento: 'Manutenção',
      created_at: r.created_at,
      responsavel: 'A definir',
    })));
  }

  itens = itens
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 12);

  if (itens.length) return itens;

  return Array.from({ length: 12 }).map((_, i) => ({
    id: `placeholder-${i + 1}`,
    tipo: 'placeholder',
    arquivo_url: '/img/tv/galeria-placeholder.jpg',
    legenda: 'Aguardando registros de fechamento de OS',
    os_numero: 'OS --',
    equipamento: 'Manutenção',
    created_at: new Date().toISOString(),
    responsavel: 'A definir',
  }));
}

async function getWeather() {
  const fallback = {
    cidade: 'Feira de Santana',
    temp: '--',
    umidade: '--',
    vento: '--',
    condicao: 'Previsão indisponível no momento',
    codigo: null,
    previsao: [],
    updatedAt: new Date().toISOString(),
  };

  try {
    if (typeof fetch !== 'function') {
      return { ...fallback, condicao: 'Node sem fetch nativo. Use Node 18+ ou implemente fallback.' };
    }

    const url =
      'https://api.open-meteo.com/v1/forecast' +
      '?latitude=-12.2664&longitude=-38.9663' +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=America%2FBahia&forecast_days=5';

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Falha ao consultar clima');

    const json = await response.json();
    const current = json.current || {};
    const daily = json.daily || {};

    const mapWeather = (code) => {
      const c = Number(code);
      if ([0].includes(c)) return 'Céu limpo';
      if ([1, 2].includes(c)) return 'Parcialmente nublado';
      if ([3].includes(c)) return 'Nublado';
      if ([45, 48].includes(c)) return 'Neblina';
      if ([51, 53, 55, 56, 57].includes(c)) return 'Garoa';
      if ([61, 63, 65, 66, 67].includes(c)) return 'Chuva';
      if ([80, 81, 82].includes(c)) return 'Pancadas de chuva';
      if ([95, 96, 99].includes(c)) return 'Trovoadas';
      return 'Condição variável';
    };

    const previsao = (daily.time || []).map((date, index) => ({
      data: date,
      max: daily.temperature_2m_max?.[index] ?? null,
      min: daily.temperature_2m_min?.[index] ?? null,
      codigo: daily.weather_code?.[index] ?? null,
      condicao: mapWeather(daily.weather_code?.[index]),
    }));

    return {
      cidade: 'Feira de Santana',
      temp: Math.round(current.temperature_2m ?? 0),
      umidade: current.relative_humidity_2m ?? '--',
      vento: Math.round(current.wind_speed_10m ?? 0),
      codigo: current.weather_code ?? null,
      condicao: mapWeather(current.weather_code),
      previsao,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[TV] clima fallback:', err.message);
    return fallback;
  }
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
  const abertas = osList.filter((o) => o.status === 'ABERTA').length;
  const andamento = osList.filter((o) => o.status === 'EM_ANDAMENTO').length;
  const pausadas = osList.filter((o) => o.status === 'PAUSADA').length;
  const concluidas = osList.filter((o) => o.status === 'CONCLUIDA').length;

  const criticas = osList.filter((o) => o.prioridade === 'CRITICA' && o.status !== 'CONCLUIDA').length;
  const altas = osList.filter((o) => o.prioridade === 'ALTA').length;
  const medias = osList.filter((o) => o.prioridade === 'MEDIA').length;
  const baixas = osList.filter((o) => o.prioridade === 'BAIXA').length;

  const porEquipamentoMap = {};
  osList.forEach((o) => {
    const key = o.equipamento || 'Não informado';
    porEquipamentoMap[key] = (porEquipamentoMap[key] || 0) + 1;
  });

  const porEquipamento = Object.entries(porEquipamentoMap)
    .map(([equipamento, total]) => ({ equipamento, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return {
    abertas,
    andamento,
    pausadas,
    concluidas,
    criticas,
    altas,
    medias,
    baixas,
    total: osList.length,
    statusChart: [
      { label: 'Abertas', value: abertas, color: '#ef4444' },
      { label: 'Andamento', value: andamento, color: '#3b82f6' },
      { label: 'Pausadas', value: pausadas, color: '#f59e0b' },
      { label: 'Concluídas', value: concluidas, color: '#10b981' },
    ],
    prioridadeChart: [
      { label: 'Crítica', value: criticas, color: '#ef4444' },
      { label: 'Alta', value: altas, color: '#f97316' },
      { label: 'Média', value: medias, color: '#eab308' },
      { label: 'Baixa', value: baixas, color: '#3b82f6' },
    ],
    porEquipamento,
  };
}

function getAvisosAtivos() {
  const table = firstTable(['avisos', 'comunicados', 'alertas']);
  if (!table) return [];

  const id = pickCol(table, ['id']);
  const titulo = pickCol(table, ['titulo', 'title'], "'Aviso'");
  const descricao = pickCol(table, ['descricao', 'mensagem', 'texto'], "''");
  const ativo = pickCol(table, ['ativo', 'is_active'], '1');

  return safeAll(`
    SELECT ${id} AS id, ${titulo} AS titulo, ${descricao} AS descricao
    FROM ${table}
    WHERE COALESCE(${ativo}, 1) = 1
    ORDER BY id DESC
    LIMIT 5
  `);
}

function getTicker(osList, preventivas, avisos = []) {
  const msgs = [];

  osList
    .filter((o) => o.status !== 'CONCLUIDA')
    .slice(0, 6)
    .forEach((o) => {
      msgs.push({
        id: `os-${o.id}`,
        tipo: o.prioridade === 'CRITICA' ? 'nova_os' : 'manutencao',
        texto: `${o.numero} • ${o.equipamento} • ${o.status} • Responsável: ${o.responsavel}`,
        criticidade: o.prioridade,
      });
    });

  preventivas
    .filter((p) => p.status === 'ATRASADA')
    .slice(0, 3)
    .forEach((p) => {
      msgs.push({
        id: `prev-${p.id}`,
        tipo: 'aviso',
        texto: `Preventiva atrasada • ${p.equipamento} • ${p.responsavel}`,
        criticidade: 'MEDIA',
      });
    });

  avisos.slice(0, 5).forEach((a) => {
    msgs.push({
      id: `aviso-${a.id}`,
      tipo: 'aviso',
      texto: `${a.titulo} • ${a.descricao || ''}`,
      criticidade: 'BAIXA',
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
  const [os, preventivas, galeria, weather] = await Promise.all([getOS(), getPreventivas(), getGaleria(), getWeather()]);

  const equipeData = await getEquipeManutencaoViaEscala(os);
  const rankingEquipe = await getRankingEquipe(os, equipeData.equipe);
  const avisos = getAvisosAtivos();

  return {
    os,
    mecanicos: equipeData.equipe,
    equipeManutencao: equipeData.equipe,
    escalaVigente: equipeData.escalaVigente,
    rankingEquipe,
    preventivas,
    galeria,
    weather,
    alertas: getAlertas(os, preventivas),
    performance: getPerformance(os),
    ticker: getTicker(os, preventivas, avisos),
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

function fallbackPreventivas() {
  const today = toIsoDate(new Date()) || new Date().toISOString().slice(0, 10);
  return [
    { id: 1, tarefa: 'Lubrificação geral', equipamento: 'PRENSA P50', dataPrevista: today, status: 'PENDENTE', responsavel: 'Fábio' },
    { id: 2, tarefa: 'Inspeção de válvulas', equipamento: 'DIGESTOR 1', dataPrevista: today, status: 'NO_PRAZO', responsavel: 'Diogo' },
  ];
}

module.exports = {
  getSnapshot,
  getWeather,
  reconhecerAlerta,
  getEquipeManutencaoViaEscala,
  getEscalaVigente,
  getRankingEquipe,
};
