const express = require('express');
const { requireLogin, requireRole } = require('../auth/auth.middleware');
const cleanup = require('../os/media-cleanup.service');
const storage = require('../../config/storage');
const maintenance = require('./storage-maintenance.service');
const mediaVolume = require('./media-volume.service');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const ADMIN = ['ADMIN'];
const ACCESS = ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO'];

function volumeUsage(dir) { let total = 0; const walk = (d) => { if (!fs.existsSync(d)) return; for (const entry of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, entry.name); if (entry.isDirectory()) walk(p); else if (entry.isFile()) total += fs.statSync(p).size || 0; } }; walk(path.join(dir, 'os')); return total; }


router.get('/limpeza-volume', requireLogin, requireRole(ADMIN), (req, res) => {
  res.locals.activeMenu = 'admin-limpeza-volume';
  const olderThanDays = Number(req.query.older_than_days || 0) || 0;
  const stats = mediaVolume.scanAttachments({ olderThanDays });
  let logs = '';
  try { logs = fs.readFileSync(path.join(storage.DATA_DIR, 'logs', 'limpeza-anexos.log'), 'utf8').trim().split(/\r?\n/).slice(-20).join('\n'); } catch (_e) {}
  return res.render('admin/limpeza-volume', { title: 'Limpeza de volume', stats, olderThanDays, logs, formatBytes: mediaVolume.formatBytes });
});

router.post('/limpeza-volume', requireLogin, requireRole(ADMIN), (req, res) => {
  const olderThanDays = Number(req.body.older_than_days || 0) || 0;
  const action = String(req.body.action || 'dry-run');
  const who = req.session?.user?.name || req.session?.user?.email || `user:${req.session?.user?.id || 'admin'}`;
  try {
    if (action === 'confirm') {
      if (String(req.body.confirm_text || '').trim() !== 'APAGAR ANEXOS') {
        req.flash('error', 'Digite exatamente APAGAR ANEXOS para confirmar a exclusão de imagens e vídeos.');
        return res.redirect(`/admin/limpeza-volume?older_than_days=${olderThanDays}`);
      }
      const result = mediaVolume.cleanupAttachments({ dryRun: false, confirm: true, olderThanDays, user: who });
      req.flash('success', `Limpeza concluída: ${result.deleted} arquivos apagados; ${mediaVolume.formatBytes(result.freedBytes)} liberados.`);
    } else {
      const result = mediaVolume.cleanupAttachments({ dryRun: true, olderThanDays, user: who });
      req.flash('success', `Simulação: ${result.candidates} arquivos seriam apagados; ${mediaVolume.formatBytes(result.freedBytes)} seriam liberados.`);
    }
  } catch (e) {
    req.flash('error', e.message || String(e));
  }
  return res.redirect(`/admin/limpeza-volume?older_than_days=${olderThanDays}`);
});

router.get('/armazenamento', requireLogin, requireRole(ACCESS), (req, res) => {
  res.locals.activeMenu = 'admin-armazenamento';
  const env = cleanup.getEnv();
  const last = cleanup.getLastCleanupLog();
  const history = cleanup.getCleanupHistory(100);
  const nextRun = `Dia ${env.dayOfMonth} às 02:00 (${env.timezone || 'America/Bahia'})`;
  return res.render('admin/armazenamento', { title: 'Armazenamento', env, last, history, nextRun, volumeBytes: volumeUsage(storage.UPLOAD_DIR), diagnostic: maintenance.diagnostic(), formatBytes: maintenance.formatBytes });
});

router.post('/armazenamento/limpar-sessoes', requireLogin, requireRole(ADMIN), (req, res) => { const r = maintenance.ensureSessionMaintenance(); req.flash('success', `Sessões expiradas removidas: ${r.deleted || 0}.`); res.redirect('/admin/armazenamento'); });
router.post('/armazenamento/limpar-temporarios', requireLogin, requireRole(ADMIN), (req, res) => { const r = maintenance.cleanup(); req.flash('success', `Limpeza concluída: ${r.tmp.removed} temporários, ${r.logs.removed} logs, ${r.pdfs.removed} PDFs temporários.`); res.redirect('/admin/armazenamento'); });
router.post('/armazenamento/checkpoint-wal', requireLogin, requireRole(ADMIN), (req, res) => { maintenance.checkpointWal(); req.flash('success', 'Checkpoint WAL executado com segurança.'); res.redirect('/admin/armazenamento'); });
router.post('/armazenamento/otimizar', requireLogin, requireRole(ADMIN), (req, res) => { try { const r = maintenance.optimizeVacuum(); req.flash('success', `SQLite otimizado: ${maintenance.formatBytes(r.before)} -> ${maintenance.formatBytes(r.after)}.`); } catch (e) { req.flash('error', e.message || String(e)); } res.redirect('/admin/armazenamento'); });

router.post('/armazenamento/limpeza-midia', requireLogin, requireRole(ACCESS), async (req, res) => { const who = req.session?.user?.name || req.session?.user?.email || 'usuario'; const result = await cleanup.runMonthlyMediaCleanup({ executedBy: who, force: true, executionType: 'MANUAL' }); req.flash('success', result?.skipped ? 'Limpeza não executada.' : 'Limpeza concluída. O relatório PDF foi gerado e arquivado com sucesso.'); return res.redirect('/admin/armazenamento'); });
router.get('/armazenamento/limpeza-midia/:id/pdf', requireLogin, requireRole(ACCESS), (req, res) => { const log = cleanup.getCleanupLogById(req.params.id); if (!log?.caminho_pdf || !fs.existsSync(log.caminho_pdf)) { req.flash('error', 'Relatório PDF não encontrado para este registro.'); return res.redirect('/admin/armazenamento'); } return res.download(log.caminho_pdf, log.nome_pdf || path.basename(log.caminho_pdf)); });
router.get('/armazenamento/limpeza-midia/historico', requireLogin, requireRole(ACCESS), (req, res) => res.json({ logs: cleanup.getCleanupHistory(200) }));
module.exports = router;
