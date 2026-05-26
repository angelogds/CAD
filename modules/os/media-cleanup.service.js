const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../../database/db');
const storagePaths = require('../../config/storage');

const MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.heic', '.heif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm']);
const DEFAULT_REASON = 'Limpeza automática mensal de mídia com mais de 30 dias';
const INSTITUTIONAL_TEXT = 'Este relatório registra a limpeza de arquivos de mídia vinculados às Ordens de Serviço do sistema Manutenção Campo do Gado. A rotina remove apenas fotos, vídeos e anexos antigos para controle de armazenamento. As informações escritas das Ordens de Serviço, como descrição, equipamento, setor, diagnóstico, ações executadas, responsáveis, datas, status e histórico textual, permanecem preservadas no sistema.';

function tableExists(name) { try { return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name); } catch (_e) { return false; } }
function columnExists(table, col) { try { return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col); } catch (_e) { return false; } }

function getEnv() {
  return {
    enabled: String(process.env.MEDIA_CLEANUP_ENABLED || 'true').toLowerCase() === 'true',
    retentionDays: Math.max(1, Number(process.env.MEDIA_RETENTION_DAYS || 30)),
    dayOfMonth: Math.min(28, Math.max(1, Number(process.env.MEDIA_CLEANUP_DAY_OF_MONTH || 1))),
    timezone: process.env.MEDIA_CLEANUP_TIMEZONE || 'America/Bahia',
    osPurgeEnabled: String(process.env.OS_PURGE_ENABLED || 'false').toLowerCase() === 'true',
    osRetentionMonths: Math.max(1, Number(process.env.OS_RETENTION_MONTHS || 6)),
    osPurgePdfRequired: String(process.env.OS_PURGE_PDF_REQUIRED || 'true').toLowerCase() === 'true',
  };
}

function getRetentionCutoffDate() { const { retentionDays } = getEnv(); const d = new Date(); d.setDate(d.getDate() - retentionDays); return d; }
const monthRef = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function resolveAllowedDirs() {
  return [path.join(storagePaths.UPLOAD_DIR, 'os'), path.resolve('uploads/os'), path.resolve('public/uploads/os'), '/app/data/uploads/os', '/app/uploads/os'].map((d) => path.resolve(d));
}
function resolveReportDir(refDate = new Date()) {
  const year = String(refDate.getFullYear());
  const month = String(refDate.getMonth() + 1).padStart(2, '0');
  const baseA = path.resolve(storagePaths.DATA_DIR || path.dirname(storagePaths.UPLOAD_DIR), 'relatorios', 'limpeza-midia');
  const baseB = path.resolve(storagePaths.UPLOAD_DIR, 'relatorios', 'limpeza-midia');
  const base = fs.existsSync(path.dirname(baseA)) ? baseA : baseB;
  const dir = path.join(base, year, month);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function isAllowedFilePath(fp) { const abs = path.resolve(fp); return resolveAllowedDirs().some((dir) => abs.startsWith(dir + path.sep) || abs === dir); }

function findOldOsMediaAttachments(cutoffDate = getRetentionCutoffDate()) {
  const table = tableExists('os_anexos') ? 'os_anexos' : (tableExists('anexos') ? 'anexos' : null);
  if (!table) return [];
  const cutoff = cutoffDate.toISOString();
  const osEquipamentoExpr = columnExists('os', 'equipamento') ? 'o.equipamento' : "'-'";
  const osSetorExpr = columnExists('os', 'setor') ? 'o.setor' : "'-'";
  const osStatusExpr = columnExists('os', 'status') ? 'o.status' : "'-'";
  const osOpenedAtExpr = columnExists('os', 'opened_at') ? 'o.opened_at' : 'NULL';
  const osClosedAtExpr = columnExists('os', 'closed_at') ? 'o.closed_at' : 'NULL';
  const osOpenedByExpr = columnExists('os', 'opened_by') ? 'o.opened_by' : 'NULL';

  const rows = table === 'os_anexos'
    ? db.prepare(`SELECT a.id, a.os_id, a.path AS filepath, a.created_at, a.arquivo_removido,
      ${osEquipamentoExpr} AS equipamento, ${osSetorExpr} AS setor, ${osStatusExpr} AS status,
      ${osOpenedAtExpr} AS opened_at, ${osClosedAtExpr} AS closed_at, COALESCE(u.name,'-') AS responsavel
      FROM os_anexos a LEFT JOIN os o ON o.id = a.os_id LEFT JOIN users u ON u.id = ${osOpenedByExpr}
      WHERE datetime(a.created_at) <= datetime(?)`).all(cutoff)
    : db.prepare(`SELECT a.id, a.owner_id AS os_id, a.filepath, a.uploaded_at AS created_at, a.arquivo_removido,
      ${osEquipamentoExpr} AS equipamento, ${osSetorExpr} AS setor, ${osStatusExpr} AS status,
      ${osOpenedAtExpr} AS opened_at, ${osClosedAtExpr} AS closed_at, COALESCE(u.name,'-') AS responsavel
      FROM anexos a LEFT JOIN os o ON o.id = a.owner_id LEFT JOIN users u ON u.id = ${osOpenedByExpr}
      WHERE a.owner_type='os' AND datetime(a.uploaded_at) <= datetime(?)`).all(cutoff);
  const anexoRows = rows.filter((r) => {
    const ext = path.extname(String(r.filepath || '').split('?')[0]).toLowerCase();
    return MEDIA_EXTENSIONS.has(ext) && Number(r.arquivo_removido || 0) !== 1;
  });

  const fechamentoRows = tableExists('os_fechamento_midias')
    ? db.prepare(`SELECT m.id, m.os_id, m.caminho_arquivo AS filepath, m.created_at, 0 AS arquivo_removido,
      ${osEquipamentoExpr} AS equipamento, ${osSetorExpr} AS setor, ${osStatusExpr} AS status,
      ${osOpenedAtExpr} AS opened_at, ${osClosedAtExpr} AS closed_at, COALESCE(u.name,'-') AS responsavel
      FROM os_fechamento_midias m
      LEFT JOIN os o ON o.id = m.os_id
      LEFT JOIN users u ON u.id = ${osOpenedByExpr}
      WHERE datetime(m.created_at) <= datetime(?)
        AND m.caminho_arquivo IS NOT NULL
        AND m.caminho_arquivo NOT LIKE '__REMOVIDO__:%'`).all(cutoff)
    : [];

  const midiaRows = fechamentoRows.filter((r) => {
    const ext = path.extname(String(r.filepath || '').split('?')[0]).toLowerCase();
    return MEDIA_EXTENSIONS.has(ext);
  }).map((r) => ({ ...r, sourceTable: 'os_fechamento_midias' }));

  return [...anexoRows.map((r) => ({ ...r, sourceTable: table })), ...midiaRows];
}

function deletePhysicalFileSafely(filepath) {
  const rel = String(filepath || '').replace(/^\/+uploads\//, '').replace(/^\/+/, '');
  const candidates = [filepath, path.join(storagePaths.UPLOAD_DIR, rel), path.resolve(filepath), path.resolve('public', rel)].filter(Boolean);
  for (const c of candidates) {
    const abs = path.resolve(c);
    if (!isAllowedFilePath(abs)) continue;
    if (fs.existsSync(abs)) {
      if (String(abs).includes(`${path.sep}relatorios${path.sep}`)) return { removed: false, size: 0, missing: false, blocked: true, absolutePath: abs };
      const size = fs.statSync(abs).size || 0;
      fs.unlinkSync(abs);
      return { removed: true, size, missing: false, absolutePath: abs };
    }
  }
  return { removed: false, size: 0, missing: true };
}

function markAttachmentAsRemoved(attachmentId, executedBy = 'sistema', reason = DEFAULT_REASON, sourceTable = null) {
  const now = new Date().toISOString();
  if (sourceTable === 'os_fechamento_midias') {
    db.prepare(`UPDATE os_fechamento_midias SET caminho_arquivo=?, legenda=COALESCE(legenda,'') || ? , updated_at=datetime('now') WHERE id=?`)
      .run(`__REMOVIDO__:${attachmentId}:${Date.now()}`, ` | [arquivo removido em ${now} por ${executedBy}]`, attachmentId);
    return;
  }
  const table = tableExists('os_anexos') ? 'os_anexos' : (tableExists('anexos') ? 'anexos' : null);
  if (!table) return;
  const has = (c) => columnExists(table, c);
  if (has('arquivo_removido')) db.prepare(`UPDATE ${table} SET arquivo_removido=1 WHERE id=?`).run(attachmentId);
  if (has('removido_em')) db.prepare(`UPDATE ${table} SET removido_em=? WHERE id=?`).run(now, attachmentId);
  if (has('removido_por')) db.prepare(`UPDATE ${table} SET removido_por=? WHERE id=?`).run(executedBy, attachmentId);
  if (has('motivo_remocao')) db.prepare(`UPDATE ${table} SET motivo_remocao=? WHERE id=?`).run(reason, attachmentId);
}

function fmtBytes(bytes) { if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`; return `${(bytes / (1024 * 1024)).toFixed(2)} MB`; }
function fileTypeLabel(ext) { if (VIDEO_EXTENSIONS.has(ext)) return 'VIDEO'; if (['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext)) return 'FOTO'; return 'OUTRO'; }
function findLogoPath() { const options = [path.resolve('public/IMG/logo_menu.png.png'), path.resolve('public/IMG/logopdf_campo_do_gado.png.png')]; return options.find((p) => fs.existsSync(p)) || null; }

function generateCleanupPdf(report) {
  const now = new Date();
  const month = monthRef(now);
  const dir = resolveReportDir(now);
  const fileName = `relatorio-limpeza-midia-${month}-${Date.now()}.pdf`;
  const full = path.join(dir, fileName);
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  const stream = fs.createWriteStream(full);
  doc.pipe(stream);

  doc.rect(0, 0, doc.page.width, 70).fill('#0f5132');
  const logo = findLogoPath();
  if (logo) { try { doc.image(logo, 42, 12, { fit: [80, 45] }); } catch (_e) {} }
  doc.fillColor('#ffffff').fontSize(14).text('RELATÓRIO DE LIMPEZA DE MÍDIAS DAS ORDENS DE SERVIÇO', 120, 22, { align: 'center' });
  doc.fillColor('#e6f4ea').fontSize(10).text('Manutenção Industrial Campo do Gado', 0, 50, { align: 'center' });
  doc.moveDown(3).fillColor('#111').fontSize(10);

  const lines = [
    `Mês de referência: ${report.mes_referencia}`,
    `Data/hora da execução: ${report.data_execucao}`,
    `Tipo de execução: ${report.tipo_execucao}`,
    `Executado por: ${report.executado_por}`,
    `Dias de retenção: ${report.retention_days}`,
    `Arquivos encontrados: ${report.arquivos_encontrados}`,
    `Arquivos removidos: ${report.arquivos_removidos}`,
    `Arquivos não encontrados: ${report.nao_encontrados}`,
    `Erros: ${report.total_erros}`,
    `Espaço liberado: ${fmtBytes(report.espaco_liberado_bytes || 0)}`,
    `Status: ${report.status}`,
  ];
  lines.forEach((l) => doc.text(l));
  doc.moveDown(0.8).fontSize(9).text(INSTITUTIONAL_TEXT, { align: 'justify' });
  doc.moveDown(0.8).fontSize(12).text('RESUMO DA LIMPEZA');
  doc.fontSize(9).text(`Período considerado: até ${report.data_limite_exclusao}`);
  doc.text(`Data limite para exclusão: ${report.data_limite_exclusao}`);
  doc.text(`Diretório de origem dos anexos: ${resolveAllowedDirs().join(' | ')}`);
  doc.text(`Critério aplicado: Arquivos de mídia vinculados a OS com mais de ${report.retention_days} dias`);
  doc.text('Política de preservação: Dados escritos das OS preservados');

  doc.moveDown(0.8).fontSize(12).text('ARQUIVOS REMOVIDOS POR ORDEM DE SERVIÇO');
  if (!report.details.length) {
    doc.fontSize(9).text('Nenhum arquivo elegível foi encontrado nesta execução.');
  } else {
    report.details.forEach((d) => {
      doc.fontSize(8).text(`#OS ${d.os_id} | ${d.equipamento || '-'} | ${d.setor || '-'} | ${d.status_os || '-'} | ${d.responsavel || '-'} | ${d.filename} | ${d.tipo_arquivo} | ${fmtBytes(d.tamanho_bytes || 0)} | envio ${d.data_anexo || '-'} | remoção ${d.data_remocao || '-'} | ${d.motivo_remocao}`);
    });
  }

  doc.moveDown(0.8).fontSize(12).text('ORDENS DE SERVIÇO AFETADAS');
  if (!report.osResumo.length) doc.fontSize(9).text('Nenhuma OS afetada nesta execução.');
  report.osResumo.forEach((o) => doc.fontSize(9).text(`#${o.os_id} | ${o.equipamento || '-'} | ${o.setor || '-'} | arquivos removidos: ${o.arquivos} | espaço: ${fmtBytes(o.espaco)} | Somente mídia removida; dados escritos preservados`));

  doc.moveDown(0.8).fontSize(12).text('ERROS OU ALERTAS');
  if (!report.errors.length) doc.fontSize(9).text('Nenhum erro registrado durante a limpeza.');
  report.errors.forEach((e) => doc.fontSize(9).text(`• ${e}`));

  doc.moveDown(0.8).fontSize(12).text('DECLARAÇÃO DE PRESERVAÇÃO DOS DADOS');
  doc.fontSize(9).text('Declara-se que esta rotina removeu exclusivamente arquivos de mídia antigos vinculados às Ordens de Serviço, com o objetivo de controlar o armazenamento do sistema. Os dados textuais e históricos das Ordens de Serviço permanecem preservados para consulta, auditoria e acompanhamento da manutenção.', { align: 'justify' });

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor('#666').text(`Manutenção Industrial Campo do Gado | Data de geração: ${now.toISOString()} | Página ${i + 1}/${range.count}`, 40, doc.page.height - 30, { align: 'center' });
  }
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ fileName, fullPath: full }));
    stream.on('error', reject);
  });
}

function getLastCleanupLog() { if (!tableExists('media_cleanup_logs')) return null; return db.prepare('SELECT * FROM media_cleanup_logs ORDER BY id DESC LIMIT 1').get() || null; }
function getCleanupHistory(limit = 100) { if (!tableExists('media_cleanup_logs')) return []; return db.prepare('SELECT * FROM media_cleanup_logs ORDER BY id DESC LIMIT ?').all(Math.max(1, Number(limit || 100))); }
function getCleanupLogById(id) { if (!tableExists('media_cleanup_logs')) return null; return db.prepare('SELECT * FROM media_cleanup_logs WHERE id = ?').get(Number(id)) || null; }

function shouldRunMonthlyCleanup(now = new Date()) {
  const { enabled, dayOfMonth } = getEnv(); if (!enabled) return { run: false, reason: 'disabled' };
  const already = db.prepare("SELECT id FROM media_cleanup_logs WHERE mes_referencia=? AND status='SUCCESS' LIMIT 1").get(monthRef(now));
  if (already) return { run: false, reason: 'already_ran' };
  return { run: now.getDate() >= dayOfMonth, reason: now.getDate() >= dayOfMonth ? 'due' : 'not_day_yet' };
}

async function runMonthlyMediaCleanup({ executedBy = 'sistema', force = false, executionType = 'AUTOMATICA_MENSAL' } = {}) {
  const env = getEnv();
  const month = monthRef();
  const startedAt = new Date().toISOString();
  const decision = shouldRunMonthlyCleanup(new Date());
  if (!force && !decision.run) return { skipped: true, reason: decision.reason };
  console.log('[Media Cleanup] Iniciando limpeza mensal');

  const attachments = findOldOsMediaAttachments();
  let removed = 0; let freed = 0; let missing = 0;
  let fotos = 0; let videos = 0; let outros = 0;
  const errors = []; const details = []; const osMap = new Map();

  console.log(`[Media Cleanup] Arquivos encontrados: ${attachments.length}`);
  for (const item of attachments) {
    const ext = path.extname(String(item.filepath || '').split('?')[0]).toLowerCase();
    const type = fileTypeLabel(ext);
    try {
      const del = deletePhysicalFileSafely(item.filepath);
      if (del.missing) missing += 1;
      if (del.blocked) {
        errors.push(`arquivo=${item.filepath} erro=caminho_bloqueado_ou_protegido ação=nao_marcar_removido`);
        continue;
      }
      if (del.removed) {
        removed += 1; freed += del.size;
        if (type === 'FOTO') fotos += 1; else if (type === 'VIDEO') videos += 1; else outros += 1;
        const current = osMap.get(item.os_id) || { os_id: item.os_id, equipamento: item.equipamento, setor: item.setor, arquivos: 0, espaco: 0 };
        current.arquivos += 1; current.espaco += del.size; osMap.set(item.os_id, current);
      }
      if (del.removed || del.missing) {
        markAttachmentAsRemoved(item.id, executedBy, DEFAULT_REASON, item.sourceTable);
      }
      details.push({ os_id: item.os_id, equipamento: item.equipamento, setor: item.setor, status_os: item.status, data_abertura_os: item.opened_at, data_fechamento_os: item.closed_at, responsavel: item.responsavel, filename: path.basename(item.filepath || ''), tipo_arquivo: type, tamanho_bytes: del.size || 0, data_anexo: item.created_at, data_remocao: startedAt, motivo_remocao: DEFAULT_REASON });
    } catch (err) {
      errors.push(`arquivo=${item.filepath} erro=${err.message || err} ação=continuar_processamento`);
    }
  }

  const status = errors.length ? 'PARTIAL_SUCCESS' : 'SUCCESS';
  const reportData = {
    mes_referencia: month,
    data_execucao: startedAt,
    tipo_execucao: executionType,
    executado_por: executedBy,
    retention_days: env.retentionDays,
    arquivos_encontrados: attachments.length,
    arquivos_removidos: removed,
    nao_encontrados: missing,
    total_erros: errors.length,
    espaco_liberado_bytes: freed,
    status,
    data_limite_exclusao: getRetentionCutoffDate().toISOString(),
    details,
    osResumo: Array.from(osMap.values()),
    errors,
  };
  const pdf = await generateCleanupPdf(reportData);

  console.log(`[Media Cleanup] Arquivos removidos: ${removed}`);
  console.log(`[Media Cleanup] Espaço liberado: ${(freed / 1024 / 1024).toFixed(2)} MB`);
  console.log('[Media Cleanup] Finalizado');

  db.prepare(`INSERT INTO media_cleanup_logs
    (mes_referencia,data_execucao,retention_days,arquivos_encontrados,arquivos_removidos,espaco_liberado_bytes,status,detalhes,executado_por,caminho_pdf,nome_pdf,pdf_gerado_em,total_os_afetadas,total_fotos_removidas,total_videos_removidos,total_outros_anexos_removidos,tipo_execucao)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(month, startedAt, env.retentionDays, attachments.length, removed, freed, status, errors.join('\n'), executedBy, pdf.fullPath, pdf.fileName, new Date().toISOString(), osMap.size, fotos, videos, outros, executionType);

  return { skipped: false, arquivosEncontrados: attachments.length, arquivosRemovidos: removed, espacoLiberadoBytes: freed, erros: errors, pdf };
}

module.exports = { getEnv, getRetentionCutoffDate, findOldOsMediaAttachments, deletePhysicalFileSafely, markAttachmentAsRemoved, runMonthlyMediaCleanup, shouldRunMonthlyCleanup, getCleanupHistory, getLastCleanupLog, getCleanupLogById };
