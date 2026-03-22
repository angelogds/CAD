const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../../database/db');

const NOTA_MINIMA_PADRAO = Number(process.env.ACADEMIA_NOTA_MINIMA || 70);
const ACADEMIA_EBOOKS_DIR = path.resolve(__dirname, '../../academia_ebooks');
const CURSO_BLOCOS_PADRAO = [
  { ordem: 1, titulo: 'Conceitos básicos', descricao: 'Fundamentos essenciais, termos técnicos e contexto operacional do curso.' },
  { ordem: 2, titulo: 'Aplicação na fábrica', descricao: 'Aplicação prática no ambiente fabril, rotinas e padrões institucionais.' },
  { ordem: 3, titulo: 'Falhas comuns', descricao: 'Principais falhas, riscos operacionais, prevenção e controles de segurança.' },
  { ordem: 4, titulo: 'Boas práticas', descricao: 'Prevenção, padronização operacional e melhoria contínua na rotina.' },
];
const BLOCO_STATUS = {
  BLOQUEADO: 'BLOQUEADO',
  LIBERADO: 'LIBERADO',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  CONCLUIDO: 'CONCLUIDO',
  REVISAR: 'REVISAR',
};
const PONTOS_ACADEMIA = {
  BLOCO_CONCLUIDO: 10,
  APROVACAO_BLOCO: 10,
  ETAPA_INTERNA_CONCLUIDA: 40,
  ETAPA_EXTERNA_VALIDADA: 50,
};

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toFloat(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function tableExists(name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  return !!row;
}

function columnExists(table, column) {
  if (!tableExists(table)) return false;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function hasForeignKeyToTable(table, referencedTable) {
  if (!tableExists(table)) return false;
  const fks = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
  return fks.some((fk) => String(fk.table || '').toLowerCase() === String(referencedTable || '').toLowerCase());
}

function ensureAcademiaSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS academia_cursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trilha_id INTEGER,
      titulo TEXT NOT NULL,
      descricao TEXT,
      tipo TEXT DEFAULT 'INTERNO',
      plataforma TEXT DEFAULT 'INTERNO',
      link_externo TEXT,
      link_curso TEXT,
      nivel TEXT DEFAULT 'BÁSICO',
      carga_horaria INTEGER DEFAULT 0,
      nota_minima REAL DEFAULT 70,
      imagem TEXT,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_aulas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER,
      titulo TEXT,
      descricao TEXT,
      tipo_conteudo TEXT DEFAULT 'VIDEO',
      video_url TEXT,
      arquivo_url TEXT,
      ordem INTEGER,
      ativo INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS academia_blocos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      conteudo_texto TEXT,
      checklist_json TEXT,
      imagem_url TEXT,
      resumo TEXT,
      ordem INTEGER DEFAULT 1,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_ebooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER NOT NULL,
      bloco_id INTEGER,
      titulo TEXT NOT NULL,
      resumo TEXT,
      conteudo_html TEXT,
      arquivo_url TEXT,
      versao TEXT,
      publicado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_biblioteca (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT,
      descricao TEXT,
      categoria TEXT,
      tipo TEXT,
      arquivo_url TEXT,
      equipamento_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_trilhas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      descricao TEXT,
      icone TEXT,
      nivel TEXT DEFAULT 'BÁSICO',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_usuario_cursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'NAO_INICIADO',
      progresso_percentual INTEGER NOT NULL DEFAULT 0,
      iniciado_em DATETIME,
      concluido_em DATETIME,
      etapa_externa_liberada_em DATETIME,
      etapa_externa_liberada_por INTEGER,
      UNIQUE (usuario_id, curso_id)
    );
    CREATE TABLE IF NOT EXISTS academia_usuario_blocos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      bloco_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'BLOQUEADO',
      nota REAL,
      percentual REAL,
      concluido_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (usuario_id, bloco_id)
    );
    CREATE TABLE IF NOT EXISTS academia_perguntas_bloco (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bloco_id INTEGER NOT NULL,
      pergunta TEXT NOT NULL,
      tipo TEXT DEFAULT 'OBJETIVA',
      alternativa_a TEXT,
      alternativa_b TEXT,
      alternativa_c TEXT,
      alternativa_d TEXT,
      resposta_correta TEXT,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_respostas_bloco (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      bloco_id INTEGER NOT NULL,
      pergunta_id INTEGER NOT NULL,
      resposta_usuario TEXT,
      correta INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_avaliacao_final (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      nota REAL,
      percentual REAL,
      status TEXT DEFAULT 'REVISAR',
      respostas_json TEXT,
      finalizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      tipo_avaliacao TEXT DEFAULT 'OBJETIVA',
      nota REAL,
      percentual REAL,
      status TEXT DEFAULT 'REVISAR',
      feedback TEXT,
      recomendacao_ia TEXT,
      respostas_json TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_avaliacoes_modelo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      curso_id INTEGER NOT NULL UNIQUE,
      perguntas_objetivas_json TEXT,
      perguntas_curtas_json TEXT,
      nota_minima REAL DEFAULT 70,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_certificados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'INTERNO',
      arquivo_url TEXT,
      codigo_validacao TEXT,
      emitido_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_documentos_internos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      tipo_documento TEXT NOT NULL,
      codigo_validacao TEXT NOT NULL,
      observacao_institucional TEXT,
      carga_horaria_interna INTEGER DEFAULT 0,
      arquivo_url TEXT,
      emitido_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_etapas_externas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      plataforma TEXT NOT NULL DEFAULT 'CURSA',
      link_externo TEXT,
      certificado_url TEXT,
      certificado_nome_arquivo TEXT,
      data_conclusao DATETIME,
      status_validacao TEXT DEFAULT 'PENDENTE',
      validado_por INTEGER,
      validado_em DATETIME,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_interacoes_ia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      curso_id INTEGER,
      tipo_interacao TEXT,
      pergunta TEXT,
      resposta TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_pontos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      origem TEXT NOT NULL,
      pontos INTEGER NOT NULL DEFAULT 0,
      detalhe TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS academia_beneficios_planejamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      curso_id INTEGER,
      campanha_nome TEXT,
      meta_mensal INTEGER,
      pontos_periodo INTEGER DEFAULT 0,
      periodo_ref TEXT,
      status TEXT DEFAULT 'PLANEJADO',
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (!columnExists('academia_cursos', 'nota_minima')) db.exec("ALTER TABLE academia_cursos ADD COLUMN nota_minima REAL DEFAULT 70");
  if (!columnExists('academia_usuario_cursos', 'etapa_externa_liberada_em')) db.exec("ALTER TABLE academia_usuario_cursos ADD COLUMN etapa_externa_liberada_em DATETIME");
  if (!columnExists('academia_usuario_cursos', 'etapa_externa_liberada_por')) db.exec("ALTER TABLE academia_usuario_cursos ADD COLUMN etapa_externa_liberada_por INTEGER");
  if (!columnExists('academia_usuario_blocos', 'status')) db.exec(`ALTER TABLE academia_usuario_blocos ADD COLUMN status TEXT NOT NULL DEFAULT '${BLOCO_STATUS.BLOQUEADO}'`);
  if (!columnExists('academia_usuario_blocos', 'nota')) db.exec("ALTER TABLE academia_usuario_blocos ADD COLUMN nota REAL");
  if (!columnExists('academia_usuario_blocos', 'percentual')) db.exec("ALTER TABLE academia_usuario_blocos ADD COLUMN percentual REAL");

  if (!columnExists('academia_avaliacoes', 'tipo_avaliacao')) db.exec("ALTER TABLE academia_avaliacoes ADD COLUMN tipo_avaliacao TEXT DEFAULT 'OBJETIVA'");
  if (!columnExists('academia_avaliacoes', 'recomendacao_ia')) db.exec("ALTER TABLE academia_avaliacoes ADD COLUMN recomendacao_ia TEXT");
  if (!columnExists('academia_avaliacoes', 'respostas_json')) db.exec("ALTER TABLE academia_avaliacoes ADD COLUMN respostas_json TEXT");

  if (tableExists('trilhas_conhecimento')) {
    db.exec(`
      INSERT OR IGNORE INTO academia_trilhas (id, nome, descricao, icone, nivel, ativo, criado_em)
      SELECT id, nome, descricao, icone, 'BÁSICO', 1, criado_em
      FROM trilhas_conhecimento;
    `);
  }

  if (tableExists('academia_progresso')) {
    db.exec(`
      INSERT OR IGNORE INTO academia_usuario_cursos (usuario_id, curso_id, status, progresso_percentual, iniciado_em, concluido_em)
      SELECT
        p.usuario_id,
        p.curso_id,
        COALESCE(p.status, 'NAO_INICIADO'),
        CASE WHEN p.status='CONCLUIDO' THEN 100 WHEN p.status='EM_ANDAMENTO' THEN 50 ELSE 0 END,
        p.data_inicio,
        p.data_conclusao
      FROM academia_progresso p;
    `);
  }
}

function toSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function sanitizeCursoPalavraChave(titulo) {
  return String(titulo || 'curso técnico').toLowerCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToSafeHtml(markdown) {
  return `<pre>${escapeHtml(markdown)}</pre>`;
}

function getResumoFromMarkdown(markdown, fallback = 'E-book técnico institucional para aplicação direta na rotina da fábrica.') {
  const lines = String(markdown || '').split('\n').map((line) => line.trim());
  const candidate = lines.find((line) => line && !line.startsWith('#'));
  return candidate || fallback;
}

function getTituloFromMarkdown(markdown, cursoTitulo) {
  const firstLine = String(markdown || '').split('\n')[0] || '';
  const heading = firstLine.replace(/^#\s+/, '').trim();
  if (heading) return heading;
  return `E-book Institucional — ${cursoTitulo}`;
}

function syncEbooksFromDirectory() {
  if (!tableExists('academia_cursos') || !tableExists('academia_ebooks')) return 0;
  if (!fs.existsSync(ACADEMIA_EBOOKS_DIR)) return 0;

  const cursos = db.prepare('SELECT id, titulo FROM academia_cursos WHERE ativo=1').all();
  const cursoBySlug = new Map(cursos.map((curso) => [toSlug(curso.titulo), curso]));
  const arquivos = fs.readdirSync(ACADEMIA_EBOOKS_DIR).filter((nome) => nome.toLowerCase().endsWith('.md'));
  let importados = 0;

  for (const arquivo of arquivos) {
    const slugArquivo = toSlug(path.basename(arquivo, '.md'));
    const curso = cursoBySlug.get(slugArquivo);
    if (!curso) continue;

    const markdown = fs.readFileSync(path.join(ACADEMIA_EBOOKS_DIR, arquivo), 'utf8');
    const titulo = getTituloFromMarkdown(markdown, curso.titulo);
    const resumo = getResumoFromMarkdown(markdown);
    const existe = db.prepare('SELECT id FROM academia_ebooks WHERE curso_id=? AND lower(titulo)=lower(?) LIMIT 1').get(curso.id, titulo);
    if (existe) continue;

    db.prepare(`
      INSERT INTO academia_ebooks (curso_id, titulo, resumo, conteudo_html, versao, publicado_em, criado_em)
      VALUES (?, ?, ?, ?, '3.0', datetime('now'), datetime('now'))
    `).run(curso.id, titulo, resumo, markdownToSafeHtml(markdown));
    importados += 1;
  }

  return importados;
}

function getChecklistPadrao(cursoTitulo) {
  return [
    'Validar liberação da área e condição segura para intervenção.',
    `Conferir ponto crítico do equipamento relacionado a ${sanitizeCursoPalavraChave(cursoTitulo)}.`,
    'Registrar anomalias, medições e ação executada no padrão da manutenção.',
    'Confirmar teste funcional antes de liberar para operação.',
  ];
}

function getConteudoBlocoPadrao(curso, bloco, proximoCursoTitulo) {
  const termo = sanitizeCursoPalavraChave(curso.titulo);
  const mapa = {
    1: `
Introdução: ${curso.titulo} padroniza fundamentos técnicos para manutenção industrial na graxaria.
Objetivo: criar base comum de termos, parâmetros e critérios de inspeção.
Aplicação na fábrica: usar no início do turno para leitura de condição de digestores, prensas, roscas e utilidades.
Conceitos básicos: pontos de falha, modos de operação e limites de processo.
Checklist: confirmar EPIs, permissões, bloqueios aplicáveis e instrumento de medição calibrado.
Erros comuns: iniciar intervenção sem diagnóstico mínimo e sem histórico de falha.
Avaliação: identificar 3 sinais de perda de desempenho e o risco associado.
Próximo curso recomendado: ${proximoCursoTitulo}.`.trim(),
    2: `
Introdução: bloco prático para aplicar ${termo} em rotina real de manutenção.
Objetivo: executar procedimento técnico com segurança e rastreabilidade.
Aplicação na fábrica: realizar inspeção funcional, ajuste, reaperto e validação operacional em linha de reciclagem animal.
Aplicação prática: sequência padrão de preparação, execução, teste e liberação.
Checklist: evidência fotográfica, medições antes/depois e registro no sistema.
Erros comuns: pular etapa de teste com carga e não comunicar desvios ao líder.
Avaliação: estudo de caso curto sobre falha recorrente no equipamento do setor.
Próximo curso recomendado: ${proximoCursoTitulo}.`.trim(),
    3: `
Introdução: prevenção de falhas recorrentes em equipamentos críticos da manutenção.
Objetivo: reconhecer causa raiz provável e agir antes da quebra.
Aplicação na fábrica: analisar vibração, temperatura, ruído, vazamento e perda de rendimento.
Falhas comuns: desalinhamento, lubrificação inadequada, contaminação e ajuste fora do padrão.
Checklist: classificar criticidade, abrir plano de ação e definir responsável com prazo.
Erros comuns: trocar componente sem investigar a origem da falha.
Avaliação: listar duas causas mecânicas e duas causas operacionais para a mesma anomalia.
Próximo curso recomendado: ${proximoCursoTitulo}.`.trim(),
    4: `
Introdução: consolidação final do curso com foco em desempenho estável.
Objetivo: fechar padrão de execução com segurança, qualidade e produtividade.
Aplicação na fábrica: aplicar boas práticas em parada programada, retorno de linha e inspeção de rotina.
Boas práticas: padronizar checklist, lição aprendida e reunião rápida de turno.
Checklist: validar torque/aperto, limpeza técnica, condição de guarda e teste final.
Erros comuns: não atualizar histórico e repetir intervenção sem plano preventivo.
Avaliação: checklist prático com validação do instrutor interno.
Próximo curso recomendado: ${proximoCursoTitulo}.`.trim(),
  };
  return mapa[bloco.ordem] || mapa[1];
}

function getAvaliacaoModeloPadrao(curso, proximoCursoTitulo) {
  const termo = sanitizeCursoPalavraChave(curso.titulo);
  const blocoAtual = blocos.find((b) => b.status !== BLOCO_STATUS.CONCLUIDO) || null;
  return {
    objetivas: [
      `Qual é o objetivo técnico principal do curso ${curso.titulo}?`,
      `Na prática de ${termo}, qual ação reduz falha recorrente em equipamento crítico?`,
      'Qual registro é obrigatório após uma intervenção corretiva?',
      'Antes de liberar o equipamento, qual validação deve ser executada?',
    ],
    curtas: [
      `Descreva uma aplicação prática de ${termo} no seu setor e os principais cuidados operacionais.`,
    ],
  };
}

function getEbookInstitucional(curso, proximoCursoTitulo) {
  const checklist = getChecklistPadrao(curso.titulo);
  return `
<!-- AUTO_DIDATICO_V2 -->
<h2>Introdução</h2>
<p>O curso <strong>${curso.titulo}</strong> foi estruturado para manutenção industrial aplicada à reciclagem animal (graxaria), com linguagem técnica e direta.</p>
<h2>Objetivo</h2>
<p>Desenvolver capacidade operacional para executar, inspecionar e registrar intervenções com segurança, qualidade e rastreabilidade.</p>
<h2>Aplicação na fábrica</h2>
<p>Conteúdo voltado para equipamentos de processo térmico, transporte mecânico, prensagem, utilidades e apoio operacional da planta.</p>
<h2>Conceitos básicos</h2>
<p>Fundamentos técnicos, parâmetros de operação e critérios mínimos de inspeção.</p>
<h2>Aplicação prática</h2>
<p>Roteiro de execução em campo: preparação, intervenção, teste funcional e liberação.</p>
<h2>Falhas comuns</h2>
<p>Principais anomalias da rotina de manutenção em graxaria, com foco em prevenção de recorrência.</p>
<h2>Boas práticas</h2>
<p>Padronização de checklists, registros e melhoria contínua da confiabilidade.</p>
<h2>Checklist prático do curso</h2>
<ol>${checklist.map((item) => `<li>${item}</li>`).join('')}</ol>
<h2>Erros comuns</h2>
<ul>
  <li>Executar atividade sem condição segura validada.</li>
  <li>Não registrar evidências técnicas e medições.</li>
  <li>Ignorar causa raiz e tratar apenas o sintoma.</li>
</ul>
<h2>Avaliação</h2>
<p>Modelo institucional: 4 perguntas objetivas + 1 pergunta aberta (nota mínima 70).</p>
<h2>Recomendação de próximo curso</h2>
<p>Próximo passo da trilha: <strong>${proximoCursoTitulo}</strong>.</p>
  `.trim();
}

function getProximoCursoDaTrilha(cursoId, trilhaId) {
  const cursosDaTrilha = db.prepare(`
    SELECT id, titulo
    FROM academia_cursos
    WHERE trilha_id IS ? AND ativo=1
    ORDER BY titulo
  `).all(trilhaId);
  const posicao = cursosDaTrilha.findIndex((c) => Number(c.id) === Number(cursoId));
  return (posicao >= 0 && cursosDaTrilha[posicao + 1])
    ? cursosDaTrilha[posicao + 1]
    : (cursosDaTrilha[0] || { titulo: 'Revisão de Segurança em Intervenção Mecânica' });
}

function seedConteudoCursos() {
  const ebooksImportados = syncEbooksFromDirectory();
  const cursosPendentes = db.prepare(`
    SELECT
      c.id,
      c.titulo,
      c.trilha_id,
      (SELECT COUNT(*) FROM academia_blocos b WHERE b.curso_id=c.id) AS total_blocos,
      (SELECT COUNT(*) FROM academia_ebooks e WHERE e.curso_id=c.id) AS total_ebooks,
      (SELECT COUNT(*) FROM academia_avaliacoes_modelo m WHERE m.curso_id=c.id) AS total_avaliacoes
    FROM academia_cursos c
    WHERE c.ativo=1
      AND (
        (SELECT COUNT(*) FROM academia_blocos b WHERE b.curso_id=c.id) = 0
        OR (SELECT COUNT(*) FROM academia_ebooks e WHERE e.curso_id=c.id) = 0
      )
    ORDER BY c.titulo ASC
  `).all();

  const resumoExecucao = {
    cursosAnalisados: cursosPendentes.length,
    blocosCriados: 0,
    ebooksCriados: 0,
    ebooksImportados,
    avaliacoesCriadas: 0,
  };

  for (const curso of cursosPendentes) {
    const proximoCurso = getProximoCursoDaTrilha(curso.id, curso.trilha_id);

    if (Number(curso.total_blocos) === 0) {
      CURSO_BLOCOS_PADRAO.forEach((blocoPadrao) => {
        const conteudoPadrao = getConteudoBlocoPadrao(curso, blocoPadrao, proximoCurso.titulo);
        const checklistPadrao = JSON.stringify(getChecklistPadrao(curso.titulo));
        const resumoPadrao = `Aplicação prática de ${curso.titulo} com foco em ${blocoPadrao.titulo.toLowerCase()}.`;
        db.prepare(`
          INSERT INTO academia_blocos (curso_id, titulo, descricao, conteudo_texto, checklist_json, resumo, ordem, ativo, criado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
        `).run(curso.id, blocoPadrao.titulo, blocoPadrao.descricao, conteudoPadrao, checklistPadrao, resumoPadrao, blocoPadrao.ordem);
        resumoExecucao.blocosCriados += 1;
      });
    }

    if (Number(curso.total_ebooks) === 0) {
      const ebookResumoPadrao = `Guia didático completo de ${curso.titulo} com foco em manutenção industrial na graxaria.`;
      const ebookConteudoPadrao = getEbookInstitucional(curso, proximoCurso.titulo);
      db.prepare(`
        INSERT INTO academia_ebooks (curso_id, titulo, resumo, conteudo_html, versao, publicado_em, criado_em)
        VALUES (?, ?, ?, ?, '2.0', datetime('now'), datetime('now'))
      `).run(curso.id, `E-book Institucional — ${curso.titulo}`, ebookResumoPadrao, ebookConteudoPadrao);
      resumoExecucao.ebooksCriados += 1;
    }

    if (Number(curso.total_avaliacoes) === 0) {
      const avaliacaoPadrao = getAvaliacaoModeloPadrao(curso, proximoCurso.titulo);
      db.prepare(`
        INSERT INTO academia_avaliacoes_modelo (curso_id, perguntas_objetivas_json, perguntas_curtas_json, nota_minima, criado_em)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(curso.id, JSON.stringify(avaliacaoPadrao.objetivas), JSON.stringify(avaliacaoPadrao.curtas), NOTA_MINIMA_PADRAO);
      resumoExecucao.avaliacoesCriadas += 1;
    }
  }

  return resumoExecucao;
}

function seedAcademiaInicial() {
  const trilhas = [
    ['Fundamentos da Manutenção', 'Base institucional de manutenção industrial e segurança operacional.'],
    ['Mecânica Industrial', 'Mecânica aplicada à confiabilidade e intervenções industriais.'],
    ['Lubrificação', 'Gestão de lubrificação, inspeção e prevenção de desgaste prematuro.'],
    ['Caldeiraria e Fabricação', 'Traçagem, caldeiraria e fabricação de componentes industriais.'],
    ['Soldagem', 'Processos de soldagem aplicados à manutenção e fabricação.'],
    ['Elétrica e Utilidades', 'Conceitos elétricos e utilidades industriais para manutenção.'],
    ['Conhecimento da Fábrica', 'Trilha institucional focada em graxaria e reciclagem animal.'],
  ];

  const cursos = [
    ['Fundamentos da Manutenção Industrial', 'Fundamentos da Manutenção', 8],
    ['Inspeção e Identificação de Não Conformidades', 'Fundamentos da Manutenção', 6],
    ['Operação Segura de Equipamentos', 'Fundamentos da Manutenção', 6],
    ['Segurança em Intervenção Mecânica', 'Fundamentos da Manutenção', 6],
    ['NR-12 Aplicada à Manutenção', 'Fundamentos da Manutenção', 6],
    ['Mecânica Industrial Básica', 'Mecânica Industrial', 8],
    ['Rolamentos Industriais', 'Mecânica Industrial', 8],
    ['Manutenção de Redutores', 'Mecânica Industrial', 8],
    ['Alinhamento de Eixos', 'Mecânica Industrial', 8],
    ['Metrologia Industrial', 'Mecânica Industrial', 6],
    ['Lubrificação Industrial', 'Lubrificação', 6],
    ['Leitura e Interpretação de Desenho Técnico', 'Caldeiraria e Fabricação', 8],
    ['Caldeiraria Industrial e Traçagem', 'Caldeiraria e Fabricação', 8],
    ['Tubulações Industriais: Água, Vapor e Condensado', 'Caldeiraria e Fabricação', 8],
    ['Soldagem MIG', 'Soldagem', 8],
    ['Soldagem TIG', 'Soldagem', 8],
    ['Soldagem com Eletrodo Revestido', 'Soldagem', 8],
    ['Elétrica Industrial Básica para Manutenção', 'Elétrica e Utilidades', 8],
    ['Caldeiras: Operação, Segurança e Manutenção', 'Elétrica e Utilidades', 8],
    ['NR-13 Aplicada a Caldeiras e Tubulações', 'Elétrica e Utilidades', 8],
    ['Introdução à Reciclagem Animal / Graxaria', 'Conhecimento da Fábrica', 6],
    ['Operação e Manutenção de Digestores', 'Conhecimento da Fábrica', 8],
    ['Operação e Manutenção de Prensas', 'Conhecimento da Fábrica', 8],
    ['Operação e Manutenção de Roscas Transportadoras', 'Conhecimento da Fábrica', 8],
    ['Fluxo de Processo da Reciclagem Animal', 'Conhecimento da Fábrica', 6],
  ];

  const insertTrilha = db.prepare(`
    INSERT OR IGNORE INTO academia_trilhas (nome, descricao, icone, nivel, ativo, criado_em)
    VALUES (?, ?, 'school', 'BÁSICO', 1, datetime('now'))
  `);
  trilhas.forEach(([nome, descricao]) => insertTrilha.run(nome, descricao));

  const trilhaIdByNome = db.prepare('SELECT id FROM academia_trilhas WHERE nome=? LIMIT 1');
  const usaTrilhaConhecimentoComoFk = hasForeignKeyToTable('academia_cursos', 'trilhas_conhecimento');
  const trilhaConhecimentoIdByNome = tableExists('trilhas_conhecimento')
    ? db.prepare('SELECT id FROM trilhas_conhecimento WHERE nome=? LIMIT 1')
    : null;
  const mapaTrilhaLegada = {
    'Fundamentos da Manutenção': 'Manutenção Industrial',
    'Mecânica Industrial': 'Mecânica Industrial',
    Lubrificação: 'Manutenção Industrial',
    'Caldeiraria e Fabricação': 'Fabricação Mecânica',
    Soldagem: 'Soldagem e Serralheria',
    'Elétrica e Utilidades': 'Elétrica Industrial',
    'Conhecimento da Fábrica': 'Manutenção Industrial',
  };
  const cursoPorSlug = new Map();
  const todosCursos = db.prepare('SELECT id, titulo FROM academia_cursos').all();
  for (const c of todosCursos) {
    const slug = toSlug(c.titulo);
    if (!cursoPorSlug.has(slug)) cursoPorSlug.set(slug, []);
    cursoPorSlug.get(slug).push(c.id);
  }

  for (const ids of cursoPorSlug.values()) {
    if (ids.length <= 1) continue;
    const [manter, ...remover] = ids.sort((a, b) => a - b);
    remover.forEach((id) => {
      db.prepare('DELETE FROM academia_usuario_cursos WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_usuario_blocos WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_aulas WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_blocos WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_ebooks WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_avaliacoes WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_avaliacoes_modelo WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_certificados WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_documentos_internos WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_etapas_externas WHERE curso_id=?').run(id);
      db.prepare('DELETE FROM academia_cursos WHERE id=?').run(id);
    });
    db.prepare('UPDATE academia_cursos SET ativo=1 WHERE id=?').run(manter);
  }

  const insertCurso = db.prepare(`
    INSERT INTO academia_cursos (trilha_id, titulo, descricao, tipo, plataforma, link_externo, nivel, carga_horaria, nota_minima, imagem, ativo, criado_em)
    VALUES (?, ?, ?, 'INTERNO', 'INTERNO', ?, 'BÁSICO', ?, ?, '/IMG/menu_campo_do_gado.png.png.png.png.png', 1, datetime('now'))
  `);

  for (const [titulo, trilhaNome, cargaHoraria] of cursos) {
    const trilhaIdAcademia = trilhaIdByNome.get(trilhaNome)?.id || null;
    const trilhaNomeLegada = mapaTrilhaLegada[trilhaNome] || trilhaNome;
    const trilhaIdLegada = trilhaConhecimentoIdByNome?.get(trilhaNomeLegada)?.id || null;
    const trilhaId = usaTrilhaConhecimentoComoFk ? trilhaIdLegada : trilhaIdAcademia;
    const linkExterno = `https://cursa.app/curso-complementar/${toSlug(titulo)}`;
    const existente = db.prepare('SELECT id FROM academia_cursos WHERE lower(titulo)=lower(?) LIMIT 1').get(titulo);
    const descricao = `Capacitação interna institucional sobre ${titulo.toLowerCase()} com foco em segurança, padrão operacional e melhoria contínua.`;
    const cursoId = existente?.id || Number(insertCurso.run(trilhaId, titulo, descricao, linkExterno, cargaHoraria, NOTA_MINIMA_PADRAO).lastInsertRowid);
    if (existente) {
      db.prepare(`
        UPDATE academia_cursos
        SET trilha_id=?, descricao=?, tipo='INTERNO', plataforma='INTERNO', link_externo=COALESCE(NULLIF(link_externo,''), ?),
            carga_horaria=?, nota_minima=?, ativo=1
        WHERE id=?
      `).run(trilhaId, descricao, linkExterno, cargaHoraria, NOTA_MINIMA_PADRAO, cursoId);
    }

  }

  seedConteudoCursos();
}

function bootstrapAcademia() {
  try {
    ensureAcademiaSchema();
  } catch (err) {
    console.error('[academia] Falha ao garantir schema:', err && (err.stack || err.message || err));
  }

  try {
    seedAcademiaInicial();
  } catch (err) {
    console.error('[academia] Falha ao executar seed inicial:', err && (err.stack || err.message || err));
  }
}

bootstrapAcademia();

function getDashboardData(userId) {
  const indicadores = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM academia_usuario_cursos WHERE status='EM_ANDAMENTO' AND usuario_id=@user_id) AS cursos_em_andamento,
      (SELECT COUNT(*) FROM academia_usuario_cursos WHERE status='CONCLUIDO' AND usuario_id=@user_id) AS cursos_concluidos,
      (SELECT COUNT(*) FROM academia_documentos_internos WHERE usuario_id=@user_id) AS documentos_internos,
      (SELECT COUNT(*) FROM academia_etapas_externas WHERE usuario_id=@user_id AND status_validacao='VALIDADO') AS etapas_externas_validadas,
      (SELECT COALESCE(SUM(c.carga_horaria),0)
        FROM academia_usuario_cursos uc
        JOIN academia_cursos c ON c.id=uc.curso_id
        WHERE uc.usuario_id=@user_id AND uc.status='CONCLUIDO') AS horas_treinamento
  `).get({ user_id: userId || 0 });

  const ranking = getRanking();
  const minhaPosicao = getMinhaPosicaoRanking(userId, ranking);
  const trilhaRecomendada = getProximaTrilhaRecomendada(userId);

  return {
    indicadores,
    minhaPosicao,
    trilhaRecomendada,
    continuarEstudando: getContinuarEstudando(userId),
    cursosDestaque: getCursosDestaque(),
    trilhas: listTrilhas(userId),
    ultimosCertificados: listCertificados(userId, 4),
    avisosAcademia: getAvisosAcademia(),
    recomendacaoIA: getRecomendacaoIA(userId),
    ranking: ranking.slice(0, 5),
  };
}

function getProximaTrilhaRecomendada(userId) {
  return db.prepare(`
    SELECT
      t.id,
      t.nome,
      t.descricao,
      t.icone,
      COUNT(c.id) AS total_cursos,
      COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END), 0) AS concluidos
    FROM academia_trilhas t
    LEFT JOIN academia_cursos c ON c.trilha_id=t.id AND c.ativo=1
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=@user_id
    WHERE t.ativo=1
    GROUP BY t.id
    ORDER BY
      CASE WHEN COUNT(c.id)=0 THEN 1 ELSE 0 END ASC,
      (COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END), 0) * 1.0) / NULLIF(COUNT(c.id),0) ASC,
      t.nome ASC
    LIMIT 1
  `).get({ user_id: userId || 0 }) || null;
}

function getContinuarEstudando(userId) {
  return db.prepare(`
    SELECT
      c.id,
      c.titulo,
      c.nivel,
      c.carga_horaria,
      t.nome AS trilha_nome,
      uc.progresso_percentual,
      uc.status
    FROM academia_usuario_cursos uc
    JOIN academia_cursos c ON c.id=uc.curso_id
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    WHERE uc.usuario_id=? AND uc.status='EM_ANDAMENTO'
    ORDER BY uc.iniciado_em DESC
    LIMIT 4
  `).all(userId || 0);
}

function getCursosDestaque() {
  return db.prepare(`
    SELECT
      c.id,
      c.titulo,
      c.nivel,
      c.carga_horaria,
      c.plataforma,
      c.tipo,
      t.nome AS trilha_nome,
      COUNT(uc.id) AS total_inscritos
    FROM academia_cursos c
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id
    WHERE c.ativo=1
    GROUP BY c.id
    ORDER BY total_inscritos DESC, c.criado_em DESC
    LIMIT 6
  `).all();
}

function getAvisosAcademia() {
  return [
    { titulo: 'Capacitação institucional', descricao: 'Documentos emitidos pela Academia são internos e não configuram formação técnica oficial.' },
    { titulo: 'Etapa complementar externa', descricao: 'Após aprovação interna, o sistema libera o curso complementar no Cursa para validação externa.' },
  ];
}

function getRecomendacaoIA(userId) {
  const ultimoCurso = db.prepare(`
    SELECT c.titulo, t.nome AS trilha_nome
    FROM academia_usuario_cursos uc
    JOIN academia_cursos c ON c.id=uc.curso_id
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    WHERE uc.usuario_id=?
    ORDER BY COALESCE(uc.concluido_em, uc.iniciado_em) DESC
    LIMIT 1
  `).get(userId || 0);

  if (!ultimoCurso) {
    return 'Comece pela trilha “Conhecimento da Fábrica” para acelerar sua adaptação operacional.';
  }

  return `Com base no seu último curso (${ultimoCurso.titulo}), revise a trilha ${ultimoCurso.trilha_nome || 'principal'} e avance para um bloco prático com checklist.`;
}

function listTrilhas(userId = null) {
  return db.prepare(`
    SELECT
      t.id,
      t.nome,
      t.descricao,
      t.icone,
      t.nivel,
      COUNT(c.id) AS total_cursos,
      COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END),0) AS cursos_concluidos,
      COALESCE(ROUND((SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(c.id),0), 0),0) AS progresso_percentual
    FROM academia_trilhas t
    LEFT JOIN academia_cursos c ON c.trilha_id=t.id AND c.ativo=1
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=@user_id
    WHERE t.ativo=1
    GROUP BY t.id
    ORDER BY t.nome ASC
  `).all({ user_id: userId || 0 });
}

function listCursos(filters = {}, userId = null) {
  const trilhaId = filters.trilha_id ? Number(filters.trilha_id) : null;
  const nivel = String(filters.nivel || '').trim();
  const busca = String(filters.busca || '').trim();

  let sql = `
    SELECT
      c.*,
      t.nome AS trilha_nome,
      COALESCE(uc.status, 'NAO_INICIADO') AS meu_status,
      COALESCE(uc.progresso_percentual, 0) AS progresso_percentual,
      uc.concluido_em,
      uc.iniciado_em,
      CASE
        WHEN uc.etapa_externa_liberada_em IS NOT NULL THEN 1
        ELSE 0
      END AS etapa_externa_liberada
    FROM academia_cursos c
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=@usuario_id
    WHERE c.ativo=1
  `;

  const params = { usuario_id: userId || 0 };
  if (trilhaId) {
    sql += ' AND c.trilha_id=@trilha_id';
    params.trilha_id = trilhaId;
  }
  if (nivel) {
    sql += ' AND UPPER(c.nivel)=UPPER(@nivel)';
    params.nivel = nivel;
  }
  if (busca) {
    sql += ' AND (c.titulo LIKE @busca OR c.descricao LIKE @busca OR t.nome LIKE @busca)';
    params.busca = `%${busca}%`;
  }

  sql += ' ORDER BY c.titulo';

  return db.prepare(sql).all(params);
}

function getTrilhaDetalhe(trilhaId, userId = null) {
  const trilha = db.prepare(`
    SELECT id, nome, descricao, icone, nivel
    FROM academia_trilhas
    WHERE id=? AND ativo=1
  `).get(trilhaId);
  if (!trilha) return null;

  const cursos = listCursos({ trilha_id: trilhaId }, userId);
  const concluidos = cursos.filter((c) => c.meu_status === 'CONCLUIDO').length;
  const progresso = cursos.length ? Math.round((concluidos * 100) / cursos.length) : 0;

  return {
    ...trilha,
    cursos,
    total_cursos: cursos.length,
    concluidos,
    progresso_percentual: progresso,
  };
}

function listBlocos(cursoId, userId = null) {
  const blocos = db.prepare(`
    SELECT id, curso_id, titulo, descricao, conteudo_texto, checklist_json, imagem_url, resumo, ordem, ativo
    FROM academia_blocos
    WHERE curso_id=? AND ativo=1
    ORDER BY ordem ASC, id ASC
  `).all(cursoId);

  if (!userId) {
    return blocos.map((b) => ({
      ...b,
      status: b.ordem === 1 ? BLOCO_STATUS.LIBERADO : BLOCO_STATUS.BLOQUEADO,
      nota: null,
      percentual: null,
      concluido: false,
      checklist: (() => {
        try { return b.checklist_json ? JSON.parse(b.checklist_json) : []; } catch (_e) { return []; }
      })(),
    }));
  }

  const progresso = db.prepare(`
    SELECT bloco_id, status, nota, percentual, concluido_em
    FROM academia_usuario_blocos
    WHERE usuario_id=? AND curso_id=?
  `).all(userId, cursoId);
  const progressoByBloco = new Map(progresso.map((r) => [Number(r.bloco_id), r]));
  let ultimoConcluido = 0;
  blocos.forEach((b) => {
    const p = progressoByBloco.get(Number(b.id));
    if (p && p.status === BLOCO_STATUS.CONCLUIDO) ultimoConcluido = Math.max(ultimoConcluido, Number(b.ordem || 0));
  });

  return blocos.map((b) => {
    const p = progressoByBloco.get(Number(b.id));
    const ordem = Number(b.ordem || 0);
    const statusPadrao = ordem === 1 || ordem <= (ultimoConcluido + 1)
      ? BLOCO_STATUS.LIBERADO
      : BLOCO_STATUS.BLOQUEADO;
    const status = p?.status || statusPadrao;
    return {
    ...b,
    status,
    nota: p?.nota ?? null,
    percentual: p?.percentual ?? null,
    concluido_em: p?.concluido_em || null,
    concluido: status === BLOCO_STATUS.CONCLUIDO,
    bloqueado: status === BLOCO_STATUS.BLOQUEADO,
    checklist: (() => {
      try { return b.checklist_json ? JSON.parse(b.checklist_json) : []; } catch (_e) { return []; }
    })(),
    };
  });
}

function listEbooks(cursoId) {
  return db.prepare(`
    SELECT id, curso_id, bloco_id, titulo, resumo, conteudo_html, arquivo_url, versao, publicado_em
    FROM academia_ebooks
    WHERE curso_id=?
    ORDER BY datetime(publicado_em) DESC, id DESC
  `).all(cursoId);
}

function getCursoDetalhe(cursoId, userId = null) {
  const curso = db.prepare(`
    SELECT
      c.*,
      t.nome AS trilha_nome,
      COALESCE(uc.status, 'NAO_INICIADO') AS meu_status,
      COALESCE(uc.progresso_percentual, 0) AS progresso_percentual,
      uc.iniciado_em,
      uc.concluido_em,
      uc.etapa_externa_liberada_em,
      uc.etapa_externa_liberada_por
    FROM academia_cursos c
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=?
    WHERE c.id=?
  `).get(userId || 0, cursoId);

  if (!curso) return null;

  const aulas = db.prepare(`
    SELECT *
    FROM academia_aulas
    WHERE curso_id=? AND ativo=1
    ORDER BY ordem ASC, id ASC
  `).all(cursoId);

  const blocos = listBlocos(cursoId, userId);
  const ebooks = listEbooks(cursoId);
  const avaliacaoModelo = db.prepare(`
    SELECT perguntas_objetivas_json, perguntas_curtas_json, nota_minima
    FROM academia_avaliacoes_modelo
    WHERE curso_id=?
  `).get(cursoId);

  const avaliacao = db.prepare(`
    SELECT id, nota, percentual, status, feedback, recomendacao_ia, tipo_avaliacao, criado_em
    FROM academia_avaliacoes
    WHERE curso_id=? AND usuario_id=?
    ORDER BY criado_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);
  const avaliacaoFinal = db.prepare(`
    SELECT id, nota, percentual, status, finalizado_em
    FROM academia_avaliacao_final
    WHERE curso_id=? AND usuario_id=?
    ORDER BY finalizado_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  const etapaExterna = db.prepare(`
    SELECT *
    FROM academia_etapas_externas
    WHERE curso_id=? AND usuario_id=?
    ORDER BY criado_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  const documentoInterno = db.prepare(`
    SELECT *
    FROM academia_documentos_internos
    WHERE curso_id=? AND usuario_id=?
    ORDER BY emitido_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  const blocoAtual = blocos.find((b) => b.status !== BLOCO_STATUS.CONCLUIDO) || null;
  return {
    ...curso,
    aulas,
    blocos,
    ebooks,
    avaliacaoModelo: avaliacaoModelo ? {
      ...avaliacaoModelo,
      perguntas_objetivas: JSON.parse(avaliacaoModelo.perguntas_objetivas_json || '[]'),
      perguntas_curtas: JSON.parse(avaliacaoModelo.perguntas_curtas_json || '[]'),
    } : null,
    avaliacao,
    avaliacaoFinal,
    etapaExterna,
    documentoInterno,
    blocoAtual,
    perguntasBlocoAtual: blocoAtual ? listPerguntasBloco(blocoAtual.id) : [],
    podeLiberarEtapaExterna: podeLiberarEtapaExterna({ cursoId, userId, forceCheckOnly: true }),
  };
}

function getMinhasAulas(userId) {
  const cursos = db.prepare(`
    SELECT
      uc.*,
      c.titulo,
      c.plataforma,
      c.tipo,
      c.nivel,
      c.carga_horaria,
      c.link_externo,
      t.nome AS trilha_nome
    FROM academia_usuario_cursos uc
    JOIN academia_cursos c ON c.id=uc.curso_id
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    WHERE uc.usuario_id=?
    ORDER BY CASE uc.status
      WHEN 'EM_ANDAMENTO' THEN 1
      WHEN 'CONCLUIDO' THEN 2
      ELSE 3 END,
      COALESCE(uc.iniciado_em, uc.concluido_em, uc.id) DESC
  `).all(userId || 0);

  const progressoTrilhas = db.prepare(`
    SELECT
      t.nome,
      COUNT(c.id) AS total,
      COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN 1 ELSE 0 END), 0) AS concluidos
    FROM academia_trilhas t
    LEFT JOIN academia_cursos c ON c.trilha_id=t.id AND c.ativo=1
    LEFT JOIN academia_usuario_cursos uc ON uc.curso_id=c.id AND uc.usuario_id=?
    WHERE t.ativo=1
    GROUP BY t.id
    ORDER BY t.nome
  `).all(userId || 0);

  return {
    emAndamento: cursos.filter((c) => c.status === 'EM_ANDAMENTO'),
    concluidos: cursos.filter((c) => c.status === 'CONCLUIDO'),
    pendentes: cursos.filter((c) => c.status === 'PENDENTE' || c.status === 'NAO_INICIADO'),
    recentes: cursos.slice(0, 5),
    progressoTrilhas: progressoTrilhas.map((t) => ({
      ...t,
      percentual: t.total ? Math.round((t.concluidos * 100) / t.total) : 0,
    })),
  };
}

function listAvaliacoes(userId) {
  return db.prepare(`
    SELECT
      a.*,
      c.titulo AS curso_titulo,
      c.nivel AS curso_nivel,
      c.tipo AS curso_tipo
    FROM academia_avaliacoes a
    JOIN academia_cursos c ON c.id=a.curso_id
    WHERE a.usuario_id=?
    ORDER BY a.criado_em DESC
  `).all(userId || 0);
}

function listCertificados(userId, limit = null) {
  let sql = `
    SELECT
      cert.*,
      c.titulo AS curso_titulo,
      c.carga_horaria,
      c.tipo AS curso_tipo
    FROM academia_certificados cert
    JOIN academia_cursos c ON c.id=cert.curso_id
    WHERE cert.usuario_id=?
    ORDER BY cert.emitido_em DESC
  `;
  if (limit) sql += ` LIMIT ${toInt(limit, 4)}`;
  return db.prepare(sql).all(userId || 0);
}

function listDocumentosInternos(userId) {
  return db.prepare(`
    SELECT d.*, c.titulo AS curso_titulo
    FROM academia_documentos_internos d
    JOIN academia_cursos c ON c.id=d.curso_id
    WHERE d.usuario_id=?
    ORDER BY d.emitido_em DESC
  `).all(userId || 0);
}

function listEtapasExternas(userId) {
  return db.prepare(`
    SELECT e.*, c.titulo AS curso_titulo
    FROM academia_etapas_externas e
    JOIN academia_cursos c ON c.id=e.curso_id
    WHERE e.usuario_id=?
    ORDER BY e.criado_em DESC
  `).all(userId || 0);
}

function getHistoricoColaborador(userId) {
  return {
    cursosIniciados: db.prepare("SELECT COUNT(*) AS total FROM academia_usuario_cursos WHERE usuario_id=? AND status IN ('EM_ANDAMENTO','CONCLUIDO')").get(userId || 0)?.total || 0,
    cursosConcluidos: db.prepare("SELECT COUNT(*) AS total FROM academia_usuario_cursos WHERE usuario_id=? AND status='CONCLUIDO'").get(userId || 0)?.total || 0,
    blocosConcluidos: db.prepare("SELECT COUNT(*) AS total FROM academia_usuario_blocos WHERE usuario_id=? AND status='CONCLUIDO'").get(userId || 0)?.total || 0,
    notasPorBloco: db.prepare(`
      SELECT ub.*, b.titulo AS bloco_titulo, c.titulo AS curso_titulo
      FROM academia_usuario_blocos ub
      JOIN academia_blocos b ON b.id=ub.bloco_id
      JOIN academia_cursos c ON c.id=ub.curso_id
      WHERE ub.usuario_id=?
      ORDER BY ub.concluido_em DESC
    `).all(userId || 0),
    notaFinal: db.prepare("SELECT curso_id, nota, percentual, status, finalizado_em FROM academia_avaliacao_final WHERE usuario_id=? ORDER BY finalizado_em DESC").all(userId || 0),
    documentosInternos: listDocumentosInternos(userId),
    certificadosExternos: listEtapasExternas(userId),
    ranking: getMinhaPosicaoRanking(userId),
    ordensServicoRelacionadas: [],
  };
}

function getRanking() {
  return db.prepare(`
    WITH pontos AS (
      SELECT usuario_id, COALESCE(SUM(pontos), 0) AS pontos
      FROM academia_pontos
      GROUP BY usuario_id
    ),
    cursos AS (
      SELECT
        uc.usuario_id,
        COUNT(CASE WHEN uc.status='CONCLUIDO' THEN 1 END) AS cursos_concluidos,
        COALESCE(SUM(CASE WHEN uc.status='CONCLUIDO' THEN c.carga_horaria ELSE 0 END), 0) AS horas_estudadas
      FROM academia_usuario_cursos uc
      JOIN academia_cursos c ON c.id=uc.curso_id
      GROUP BY uc.usuario_id
    ),
    certs AS (
      SELECT usuario_id, COUNT(*) AS certificados
      FROM academia_certificados
      GROUP BY usuario_id
    )
    SELECT
      u.id AS usuario_id,
      u.name AS funcionario,
      u.role,
      COALESCE(p.pontos, 0) AS pontos,
      COALESCE(c.cursos_concluidos, 0) AS cursos_concluidos,
      COALESCE(c.horas_estudadas, 0) AS horas_estudadas,
      COALESCE(cert.certificados, 0) AS certificados
    FROM users u
    LEFT JOIN pontos p ON p.usuario_id=u.id
    LEFT JOIN cursos c ON c.usuario_id=u.id
    LEFT JOIN certs cert ON cert.usuario_id=u.id
    WHERE COALESCE(p.pontos, 0) > 0 OR COALESCE(c.cursos_concluidos, 0) > 0 OR COALESCE(cert.certificados, 0) > 0
    ORDER BY pontos DESC, cursos_concluidos DESC, horas_estudadas DESC, funcionario ASC
    LIMIT 50
  `).all();
}

function getMinhaPosicaoRanking(userId, rankingList = null) {
  if (!userId) return null;
  const ranking = Array.isArray(rankingList) ? rankingList : getRanking();
  const idx = ranking.findIndex((item) => Number(item.usuario_id) === Number(userId));
  if (idx < 0) return null;
  return {
    posicao: idx + 1,
    ...ranking[idx],
  };
}

function listBiblioteca(filters = {}) {
  let sql = `
    SELECT id, titulo, descricao, categoria, tipo, arquivo_url, equipamento_id, criado_em
    FROM academia_biblioteca
    WHERE 1=1
  `;
  const params = {};

  if (filters.categoria) {
    sql += ' AND categoria=@categoria';
    params.categoria = filters.categoria;
  }

  if (filters.busca) {
    sql += ' AND (titulo LIKE @busca OR descricao LIKE @busca OR categoria LIKE @busca)';
    params.busca = `%${filters.busca}%`;
  }

  sql += ' ORDER BY criado_em DESC, id DESC';

  return db.prepare(sql).all(params);
}

function listBibliotecaCategorias() {
  return db.prepare(`
    SELECT DISTINCT categoria
    FROM academia_biblioteca
    WHERE categoria IS NOT NULL AND categoria <> ''
    ORDER BY categoria
  `).all().map((row) => row.categoria);
}

function iniciarCurso({ cursoId, userId }) {
  const curso = db.prepare('SELECT id FROM academia_cursos WHERE id=? AND ativo=1').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado ou inativo.');

  const existente = db.prepare('SELECT id, status FROM academia_usuario_cursos WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);
  if (!existente) {
    db.prepare(`
      INSERT INTO academia_usuario_cursos (usuario_id, curso_id, status, progresso_percentual, iniciado_em)
      VALUES (?, ?, 'EM_ANDAMENTO', 5, datetime('now'))
    `).run(userId, cursoId);
    return;
  }

  if (existente.status === 'CONCLUIDO') return;

  db.prepare(`
    UPDATE academia_usuario_cursos
    SET status='EM_ANDAMENTO',
        progresso_percentual=CASE WHEN progresso_percentual < 5 THEN 5 ELSE progresso_percentual END,
        iniciado_em=COALESCE(iniciado_em, datetime('now'))
    WHERE id=?
  `).run(existente.id);
}

function getPrimeiroBloco(cursoId) {
  return db.prepare(`
    SELECT id, ordem
    FROM academia_blocos
    WHERE curso_id=? AND ativo=1
    ORDER BY ordem ASC, id ASC
    LIMIT 1
  `).get(cursoId);
}

function getProximoBlocoPendente({ cursoId, userId }) {
  const blocos = listBlocos(cursoId, userId);
  return blocos.find((b) => b.status !== BLOCO_STATUS.CONCLUIDO) || null;
}

function concluirBloco({ cursoId, blocoId, userId }) {
  const bloco = db.prepare('SELECT id, ordem FROM academia_blocos WHERE id=? AND curso_id=? AND ativo=1').get(blocoId, cursoId);
  if (!bloco) throw new Error('Bloco não encontrado.');
  const blocos = listBlocos(cursoId, userId);
  const atual = blocos.find((b) => Number(b.id) === Number(blocoId));
  if (!atual || atual.status === BLOCO_STATUS.BLOQUEADO) {
    throw new Error('Este bloco ainda está bloqueado. Conclua o bloco anterior.');
  }

  iniciarCurso({ cursoId, userId });
  db.prepare(`
    INSERT INTO academia_usuario_blocos (usuario_id, curso_id, bloco_id, status, nota, percentual, concluido_em)
    VALUES (?, ?, ?, ?, NULL, NULL, NULL)
    ON CONFLICT(usuario_id, bloco_id) DO UPDATE SET status=excluded.status
  `).run(userId, cursoId, blocoId, BLOCO_STATUS.EM_ANDAMENTO);

  return {
    percentual: db.prepare('SELECT progresso_percentual FROM academia_usuario_cursos WHERE usuario_id=? AND curso_id=?').get(userId, cursoId)?.progresso_percentual || 0,
    proximoBloco: atual,
  };
}

function listPerguntasBloco(blocoId) {
  let perguntas = db.prepare(`
    SELECT id, pergunta, tipo, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta
    FROM academia_perguntas_bloco
    WHERE bloco_id=? AND ativo=1
    ORDER BY id ASC
    LIMIT 5
  `).all(blocoId);
  if (perguntas.length >= 5) return perguntas;

  const bloco = db.prepare('SELECT titulo FROM academia_blocos WHERE id=?').get(blocoId);
  const base = bloco?.titulo || 'bloco técnico';
  const inserir = db.prepare(`
    INSERT INTO academia_perguntas_bloco (bloco_id, pergunta, tipo, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta, ativo, criado_em)
    VALUES (?, ?, 'OBJETIVA', ?, ?, ?, ?, ?, 1, datetime('now'))
  `);
  const padrao = [
    [`Qual objetivo principal do bloco "${base}"?`, 'Padronizar rotina técnica', 'Ignorar checklist', 'Aumentar retrabalho', 'Eliminar segurança', 'A'],
    ['Qual item deve ser registrado?', 'Evidências e medições', 'Somente opinião', 'Nada em sistema', 'Apenas foto sem contexto', 'A'],
    ['Em caso de risco operacional, qual ação correta?', 'Aplicar bloqueio e comunicar', 'Continuar sem parar', 'Aguardar fim do turno', 'Pular inspeção', 'A'],
    ['Qual prática reduz falhas recorrentes?', 'Análise de causa e plano de ação', 'Troca aleatória de peças', 'Não documentar', 'Executar sem teste', 'A'],
    ['Qual postura está alinhada à Academia?', 'Melhoria contínua e segurança', 'Improviso permanente', 'Ocultar anomalias', 'Desconsiderar padrão', 'A'],
  ];
  padrao.forEach((p) => inserir.run(blocoId, p[0], p[1], p[2], p[3], p[4], p[5]));
  perguntas = db.prepare(`
    SELECT id, pergunta, tipo, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta
    FROM academia_perguntas_bloco
    WHERE bloco_id=? AND ativo=1
    ORDER BY id ASC
    LIMIT 5
  `).all(blocoId);
  return perguntas;
}

function avaliarBloco({ cursoId, blocoId, userId, respostas = [] }) {
  const bloco = db.prepare('SELECT id FROM academia_blocos WHERE id=? AND curso_id=? AND ativo=1').get(blocoId, cursoId);
  if (!bloco) throw new Error('Bloco inválido.');
  const perguntas = listPerguntasBloco(blocoId);
  if (!perguntas.length) throw new Error('Bloco sem perguntas cadastradas para avaliação.');

  const respostasByPergunta = new Map((Array.isArray(respostas) ? respostas : []).map((r) => [Number(r.pergunta_id), String(r.resposta || '').trim().toUpperCase()]));
  let acertos = 0;
  perguntas.forEach((p) => {
    const respostaUsuario = respostasByPergunta.get(Number(p.id)) || '';
    const correta = String(p.resposta_correta || '').trim().toUpperCase() === respostaUsuario;
    if (correta) acertos += 1;
    db.prepare(`
      INSERT INTO academia_respostas_bloco (usuario_id, curso_id, bloco_id, pergunta_id, resposta_usuario, correta, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(userId, cursoId, blocoId, p.id, respostaUsuario, correta ? 1 : 0);
  });

  const percentual = Math.round((acertos * 100) / perguntas.length);
  const aprovado = percentual >= 50;
  const status = aprovado ? BLOCO_STATUS.CONCLUIDO : BLOCO_STATUS.REVISAR;

  db.prepare(`
    INSERT INTO academia_usuario_blocos (usuario_id, curso_id, bloco_id, status, nota, percentual, concluido_em)
    VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END)
    ON CONFLICT(usuario_id, bloco_id) DO UPDATE SET
      status=excluded.status,
      nota=excluded.nota,
      percentual=excluded.percentual,
      concluido_em=excluded.concluido_em
  `).run(userId, cursoId, blocoId, status, percentual, percentual, aprovado ? 1 : 0);

  const blocos = listBlocos(cursoId, userId);
  const total = Math.max(1, blocos.length);
  const concluidos = blocos.filter((b) => b.status === BLOCO_STATUS.CONCLUIDO).length;
  const progresso = Math.round((concluidos * 100) / total);
  db.prepare(`
    UPDATE academia_usuario_cursos
    SET progresso_percentual=?,
        status=CASE WHEN ?>=100 THEN 'CONCLUIDO' ELSE 'EM_ANDAMENTO' END,
        concluido_em=CASE WHEN ?>=100 THEN datetime('now') ELSE concluido_em END
    WHERE usuario_id=? AND curso_id=?
  `).run(progresso, progresso, progresso, userId, cursoId);

  registrarPontuacao(userId, 'BLOCO_CONCLUIDO', PONTOS_ACADEMIA.BLOCO_CONCLUIDO, `Bloco #${blocoId} concluído no curso #${cursoId}`);
  if (aprovado) registrarPontuacao(userId, 'APROVACAO_BLOCO', PONTOS_ACADEMIA.APROVACAO_BLOCO, `Bloco #${blocoId} aprovado no curso #${cursoId}`);

  return {
    aprovado,
    percentual,
    status,
    proximoBloco: getProximoBlocoPendente({ cursoId, userId }),
    avaliacaoFinalLiberada: concluidos >= total,
  };
}

function registrarPontuacao(userId, origem, pontos, detalhe = null) {
  db.prepare(`
    INSERT INTO academia_pontos (usuario_id, origem, pontos, detalhe, criado_em)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(userId, origem, toInt(pontos, 0), detalhe);
}

function emitirDocumentoInterno({ userId, cursoId, tipoDocumento = 'Declaração Interna de Conclusão de Capacitação' }) {
  const curso = db.prepare(`
    SELECT c.id, c.titulo, c.carga_horaria, t.nome AS trilha_nome
    FROM academia_cursos c
    LEFT JOIN academia_trilhas t ON t.id=c.trilha_id
    WHERE c.id=?
  `).get(cursoId);
  if (!curso) throw new Error('Curso inválido para emissão de documento interno.');
  const usuario = db.prepare('SELECT id, name FROM users WHERE id=?').get(userId);
  const avaliacaoFinal = db.prepare(`
    SELECT percentual, finalizado_em
    FROM academia_avaliacao_final
    WHERE usuario_id=? AND curso_id=?
    ORDER BY finalizado_em DESC
    LIMIT 1
  `).get(userId, cursoId);

  const codigo = `DOC-${cursoId}-${userId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const outputDir = path.resolve(__dirname, '../../public/uploads/academia/documentos-internos');
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${codigo}.pdf`;
  const absolutePath = path.join(outputDir, filename);
  const pdf = new PDFDocument({ margin: 48 });
  pdf.pipe(fs.createWriteStream(absolutePath));
  pdf.fontSize(18).text('Documento Interno de Capacitação', { align: 'center' });
  pdf.moveDown();
  pdf.fontSize(12).text(`Documento: ${tipoDocumento}`);
  pdf.text(`Colaborador: ${usuario?.name || `#${userId}`}`);
  pdf.text(`Curso: ${curso.titulo}`);
  pdf.text(`Trilha: ${curso.trilha_nome || 'Sem trilha'}`);
  pdf.text(`Carga horária interna: ${toInt(curso.carga_horaria, 0)}h`);
  pdf.text(`Data de conclusão: ${avaliacaoFinal?.finalizado_em || new Date().toISOString()}`);
  pdf.text(`Percentual final: ${toFloat(avaliacaoFinal?.percentual, 0)}%`);
  pdf.text(`Código interno de validação: ${codigo}`);
  pdf.moveDown();
  pdf.text('Documento interno de capacitação institucional. Não se trata de curso técnico reconhecido.');
  pdf.end();

  const arquivoUrl = `/uploads/academia/documentos-internos/${filename}`;
  db.prepare(`
    INSERT INTO academia_documentos_internos (usuario_id, curso_id, tipo_documento, codigo_validacao, observacao_institucional, carga_horaria_interna, arquivo_url, emitido_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    userId,
    cursoId,
    tipoDocumento,
    codigo,
    'Documento interno de capacitação institucional. Não se trata de curso técnico reconhecido.',
    toInt(curso.carga_horaria, 0),
    arquivoUrl
  );
}

function concluirCurso({ cursoId, userId }) {
  const curso = db.prepare('SELECT id, carga_horaria, tipo FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado.');

  const existente = db.prepare('SELECT id FROM academia_usuario_cursos WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);

  if (!existente) {
    db.prepare(`
      INSERT INTO academia_usuario_cursos (usuario_id, curso_id, status, progresso_percentual, iniciado_em, concluido_em)
      VALUES (?, ?, 'CONCLUIDO', 100, datetime('now'), datetime('now'))
    `).run(userId, cursoId);
  } else {
    db.prepare(`
      UPDATE academia_usuario_cursos
      SET status='CONCLUIDO',
          progresso_percentual=100,
          concluido_em=datetime('now')
      WHERE id=?
    `).run(existente.id);
  }

  registrarPontuacao(userId, 'CONCLUSAO_CURSO_INTERNO', PONTOS_ACADEMIA.ETAPA_INTERNA_CONCLUIDA, `Curso interno #${cursoId} concluído`);

  emitirDocumentoInterno({ userId, cursoId, tipoDocumento: 'Documento interno de participação' });
  emitirDocumentoInterno({ userId, cursoId, tipoDocumento: 'Documento interno de conclusão' });
  emitirDocumentoInterno({ userId, cursoId, tipoDocumento: 'Declaração interna de conclusão de capacitação' });

  const jaTemCertificado = db.prepare(`
    SELECT id FROM academia_certificados
    WHERE usuario_id=? AND curso_id=? AND tipo='INTERNO'
  `).get(userId, cursoId);

  if (!jaTemCertificado) {
    const codigo = `ACD-${cursoId}-${userId}-${Date.now()}`;
    db.prepare(`
      INSERT INTO academia_certificados (usuario_id, curso_id, tipo, arquivo_url, codigo_validacao, emitido_em)
      VALUES (?, ?, 'INTERNO', ?, ?, datetime('now'))
    `).run(userId, cursoId, `/academia/certificados?codigo=${codigo}`, codigo);
  }
}

function registrarAvaliacaoInterna({ cursoId, userId, tipoAvaliacao, nota, percentual, feedback, recomendacaoIA, respostas }) {
  const curso = db.prepare('SELECT id, nota_minima FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado para avaliação.');

  const score = toFloat(nota, 0);
  const perc = toFloat(percentual, score);
  const notaMinima = toFloat(curso.nota_minima, NOTA_MINIMA_PADRAO);
  const status = score >= notaMinima ? 'APROVADO' : 'REVISAR';

  db.prepare(`
    INSERT INTO academia_avaliacoes (curso_id, usuario_id, tipo_avaliacao, nota, percentual, status, feedback, recomendacao_ia, respostas_json, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    cursoId,
    userId,
    String(tipoAvaliacao || 'OBJETIVA').toUpperCase(),
    score,
    perc,
    status,
    feedback || null,
    recomendacaoIA || null,
    respostas ? JSON.stringify(respostas) : null
  );

  if (status === 'APROVADO') registrarPontuacao(userId, 'AVALIACAO_INTERNA_APROVADA', 20, `Avaliação aprovada do curso #${cursoId}`);

  return { status, nota: score, notaMinima };
}

function registrarAvaliacaoFinal({ cursoId, userId, nota, percentual, respostas }) {
  const score = toFloat(nota, 0);
  const perc = toFloat(percentual, score);
  const status = perc >= 70 ? 'APROVADO' : 'REVISAR';
  db.prepare(`
    INSERT INTO academia_avaliacao_final (usuario_id, curso_id, nota, percentual, status, respostas_json, finalizado_em)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(userId, cursoId, score, perc, status, respostas ? JSON.stringify(respostas) : null);

  if (status === 'APROVADO') {
    concluirCurso({ cursoId, userId });
    podeLiberarEtapaExterna({ cursoId, userId });
  }
  return { status, nota: score, percentual: perc, notaMinima: 70 };
}

function podeLiberarEtapaExterna({ cursoId, userId, forceCheckOnly = false }) {
  const progresso = db.prepare(`
    SELECT status, progresso_percentual
    FROM academia_usuario_cursos
    WHERE curso_id=? AND usuario_id=?
  `).get(cursoId, userId || 0);

  const curso = db.prepare('SELECT nota_minima, link_externo FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) return false;

  const avaliacao = db.prepare(`
    SELECT nota, status
    FROM academia_avaliacoes
    WHERE curso_id=? AND usuario_id=?
    ORDER BY criado_em DESC
    LIMIT 1
  `).get(cursoId, userId || 0);

  const notaMinima = toFloat(curso.nota_minima, NOTA_MINIMA_PADRAO);
  const regraAutomatica = !!progresso
    && (progresso.status === 'CONCLUIDO' || toInt(progresso.progresso_percentual, 0) >= 100)
    && !!avaliacao
    && (avaliacao.status === 'APROVADO' || toFloat(avaliacao.nota, 0) >= notaMinima)
    && !!curso.link_externo;

  if (forceCheckOnly) return regraAutomatica;

  if (regraAutomatica) {
    db.prepare(`
      UPDATE academia_usuario_cursos
      SET etapa_externa_liberada_em=COALESCE(etapa_externa_liberada_em, datetime('now'))
      WHERE usuario_id=? AND curso_id=?
    `).run(userId, cursoId);
  }

  return regraAutomatica;
}

function liberarEtapaExternaManual({ cursoId, userId, adminId }) {
  const progresso = db.prepare('SELECT id FROM academia_usuario_cursos WHERE usuario_id=? AND curso_id=?').get(userId, cursoId);
  if (!progresso) {
    db.prepare(`
      INSERT INTO academia_usuario_cursos (usuario_id, curso_id, status, progresso_percentual, iniciado_em)
      VALUES (?, ?, 'EM_ANDAMENTO', 60, datetime('now'))
    `).run(userId, cursoId);
  }

  db.prepare(`
    UPDATE academia_usuario_cursos
    SET etapa_externa_liberada_em=datetime('now'),
        etapa_externa_liberada_por=?
    WHERE usuario_id=? AND curso_id=?
  `).run(adminId || null, userId, cursoId);
}

function registrarEtapaExterna({ cursoId, userId, certificadoUrl, dataConclusao, plataforma = 'CURSA', linkExterno, certificadoNomeArquivo = null }) {
  const curso = db.prepare('SELECT id, link_externo FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso inválido.');

  const etapaLiberada = db.prepare(`
    SELECT etapa_externa_liberada_em
    FROM academia_usuario_cursos
    WHERE usuario_id=? AND curso_id=?
  `).get(userId, cursoId);

  if (!etapaLiberada?.etapa_externa_liberada_em) {
    const automatico = podeLiberarEtapaExterna({ cursoId, userId });
    if (!automatico) {
      throw new Error('Etapa externa ainda não liberada. Conclua o interno e atinja a nota mínima, ou solicite liberação ao administrador.');
    }
  }

  const url = String(certificadoUrl || '').trim();
  if (!url) throw new Error('Informe o link ou upload do comprovante externo.');

  db.prepare(`
    INSERT INTO academia_etapas_externas (usuario_id, curso_id, plataforma, link_externo, certificado_url, certificado_nome_arquivo, data_conclusao, status_validacao, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', datetime('now'))
  `).run(
    userId,
    cursoId,
    String(plataforma || 'CURSA').toUpperCase(),
    linkExterno || curso.link_externo || null,
    url,
    certificadoNomeArquivo,
    dataConclusao || null
  );

  registrarPontuacao(userId, 'ENVIO_CERTIFICADO_EXTERNO', 10, `Certificado externo enviado para o curso #${cursoId}`);
}

function validarEtapaExterna({ etapaId, statusValidacao, adminId }) {
  const etapa = db.prepare('SELECT id, usuario_id, curso_id, status_validacao FROM academia_etapas_externas WHERE id=?').get(etapaId);
  if (!etapa) throw new Error('Registro de etapa externa não encontrado.');

  const status = String(statusValidacao || '').toUpperCase() === 'VALIDADO' ? 'VALIDADO' : 'REPROVADO';

  db.prepare(`
    UPDATE academia_etapas_externas
    SET status_validacao=?, validado_por=?, validado_em=datetime('now')
    WHERE id=?
  `).run(status, adminId || null, etapaId);

  if (status === 'VALIDADO') {
    registrarPontuacao(etapa.usuario_id, 'ETAPA_EXTERNA_VALIDADA', PONTOS_ACADEMIA.ETAPA_EXTERNA_VALIDADA, `Etapa externa validada no curso #${etapa.curso_id}`);
    emitirDocumentoInterno({ userId: etapa.usuario_id, cursoId: etapa.curso_id, tipoDocumento: 'Documento interno de participação' });
  }
}

function salvarCertificado({ cursoId, userId, certificadoUrl }) {
  registrarEtapaExterna({ cursoId, userId, certificadoUrl });
}

function criarCurso(payload = {}) {
  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título do curso é obrigatório.');

  const info = db.prepare(`
    INSERT INTO academia_cursos (trilha_id, titulo, descricao, tipo, plataforma, link_externo, nivel, carga_horaria, nota_minima, imagem, ativo, criado_em)
    VALUES (@trilha_id, @titulo, @descricao, @tipo, @plataforma, @link_externo, @nivel, @carga_horaria, @nota_minima, @imagem, 1, datetime('now'))
  `).run({
    trilha_id: payload.trilha_id ? Number(payload.trilha_id) : null,
    titulo,
    descricao: payload.descricao || null,
    tipo: String(payload.tipo || 'INTERNO').toUpperCase(),
    plataforma: String(payload.plataforma || 'INTERNO').toUpperCase(),
    link_externo: payload.link_curso || payload.link_externo || null,
    nivel: payload.nivel || 'BÁSICO',
    carga_horaria: toInt(payload.carga_horaria, 0),
    nota_minima: toFloat(payload.nota_minima, NOTA_MINIMA_PADRAO),
    imagem: payload.imagem || null,
  });

  return Number(info.lastInsertRowid);
}

function criarAula(payload = {}) {
  const cursoId = Number(payload.curso_id);
  if (!cursoId) throw new Error('Curso inválido.');
  const curso = db.prepare('SELECT id FROM academia_cursos WHERE id=?').get(cursoId);
  if (!curso) throw new Error('Curso não encontrado.');

  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título da aula é obrigatório.');

  const info = db.prepare(`
    INSERT INTO academia_aulas (curso_id, titulo, descricao, tipo_conteudo, video_url, arquivo_url, ordem, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    cursoId,
    titulo,
    payload.descricao || null,
    String(payload.tipo_conteudo || 'VIDEO').toUpperCase(),
    payload.video_url || null,
    payload.arquivo_url || null,
    toInt(payload.ordem, 1)
  );

  return Number(info.lastInsertRowid);
}

function criarBloco(payload = {}) {
  const cursoId = Number(payload.curso_id);
  if (!cursoId) throw new Error('Curso inválido para bloco.');
  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título do bloco é obrigatório.');

  const checklist = Array.isArray(payload.checklist)
    ? payload.checklist
    : String(payload.checklist || '').split('\n').map((l) => l.trim()).filter(Boolean);

  const info = db.prepare(`
    INSERT INTO academia_blocos (curso_id, titulo, descricao, conteudo_texto, checklist_json, imagem_url, resumo, ordem, ativo, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `).run(
    cursoId,
    titulo,
    payload.descricao || null,
    payload.conteudo_texto || null,
    JSON.stringify(checklist),
    payload.imagem_url || null,
    payload.resumo || null,
    toInt(payload.ordem, 1)
  );

  return Number(info.lastInsertRowid);
}

function criarEbook(payload = {}) {
  const cursoId = Number(payload.curso_id);
  if (!cursoId) throw new Error('Curso inválido para e-book.');

  const titulo = String(payload.titulo || '').trim();
  if (!titulo) throw new Error('Título do e-book é obrigatório.');

  const info = db.prepare(`
    INSERT INTO academia_ebooks (curso_id, bloco_id, titulo, resumo, conteudo_html, arquivo_url, versao, publicado_em, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))
  `).run(
    cursoId,
    payload.bloco_id ? Number(payload.bloco_id) : null,
    titulo,
    payload.resumo || null,
    payload.conteudo_html || null,
    payload.arquivo_url || null,
    payload.versao || '1.0',
    payload.publicado_em || null
  );

  return Number(info.lastInsertRowid);
}

module.exports = {
  getDashboardData,
  listTrilhas,
  listCursos,
  getTrilhaDetalhe,
  getCursoDetalhe,
  getMinhasAulas,
  listAvaliacoes,
  listCertificados,
  listDocumentosInternos,
  listEtapasExternas,
  getHistoricoColaborador,
  getRanking,
  getMinhaPosicaoRanking,
  listBiblioteca,
  listBibliotecaCategorias,
  iniciarCurso,
  getPrimeiroBloco,
  getProximoBlocoPendente,
  concluirBloco,
  avaliarBloco,
  concluirCurso,
  salvarCertificado,
  registrarAvaliacaoInterna,
  registrarAvaliacaoFinal,
  podeLiberarEtapaExterna,
  liberarEtapaExternaManual,
  registrarEtapaExterna,
  validarEtapaExterna,
  criarCurso,
  criarAula,
  criarBloco,
  criarEbook,
  seedConteudoCursos,
  registrarPontuacao,
};
