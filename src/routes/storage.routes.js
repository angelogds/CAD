// src/routes/storage.routes.js
// REST API for storage stats, breakdown, cleanup, and backup management.
'use strict';

const express = require('express');
const { requireLogin, requireRole } = require('../../modules/auth/auth.middleware');
const storageManager = require('../services/storageManager');
const logger = require('../../utils/logger');

const router = express.Router();

const ADMIN = ['ADMIN'];
const ACCESS = ['ADMIN', 'ENCARREGADO_MANUTENCAO', 'MANUTENCAO_SUPERVISOR', 'SUPERVISOR_MANUTENCAO'];

// ─── GET /api/storage/stats ───────────────────────────────────────────────────
// Returns volume usage: total, used, free, percentage, status.
router.get('/stats', requireLogin, requireRole(ACCESS), (req, res) => {
  try {
    const stats = storageManager.getStorageStats();
    return res.json({ ok: true, stats });
  } catch (err) {
    logger.error('[storage.routes] GET /stats failed', { url: req.originalUrl }, err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// ─── GET /api/storage/breakdown ───────────────────────────────────────────────
// Returns per-directory size breakdown (images, videos, pdfs, uploads, backups).
router.get('/breakdown', requireLogin, requireRole(ACCESS), (req, res) => {
  try {
    const breakdown = storageManager.getStorageBreakdown();
    return res.json({ ok: true, breakdown });
  } catch (err) {
    logger.error('[storage.routes] GET /breakdown failed', { url: req.originalUrl }, err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// ─── POST /api/storage/cleanup ────────────────────────────────────────────────
// Trigger manual cleanup of old media files (admin only).
// Body: { dryRun?: boolean }
router.post('/cleanup', requireLogin, requireRole(ADMIN), (req, res) => {
  const dryRun = req.body?.dryRun !== false && req.body?.dryRun !== 'false';
  const who = req.session?.user?.name || req.session?.user?.email || `user:${req.session?.user?.id || 'admin'}`;

  try {
    logger.info('[storage.routes] Manual cleanup triggered', { dryRun, by: who });
    const result = storageManager.cleanupOldMedia({ dryRun });
    return res.json({ ok: true, result });
  } catch (err) {
    logger.error('[storage.routes] POST /cleanup failed', { dryRun, by: who }, err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// ─── GET /api/storage/backups ─────────────────────────────────────────────────
// List available SQLite backups.
router.get('/backups', requireLogin, requireRole(ACCESS), (req, res) => {
  try {
    const backups = storageManager.listBackups();
    return res.json({ ok: true, backups });
  } catch (err) {
    logger.error('[storage.routes] GET /backups failed', { url: req.originalUrl }, err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// ─── POST /api/storage/backup-now ────────────────────────────────────────────
// Trigger an immediate SQLite backup (admin only).
router.post('/backup-now', requireLogin, requireRole(ADMIN), (req, res) => {
  const who = req.session?.user?.name || req.session?.user?.email || `user:${req.session?.user?.id || 'admin'}`;

  try {
    logger.info('[storage.routes] Manual backup triggered', { by: who });
    const result = storageManager.backupDatabase();
    if (!result.success) {
      return res.status(500).json({ ok: false, error: result.error });
    }
    return res.json({ ok: true, result });
  } catch (err) {
    logger.error('[storage.routes] POST /backup-now failed', { by: who }, err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

module.exports = router;
