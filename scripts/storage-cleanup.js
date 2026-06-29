#!/usr/bin/env node
const svc = require('../modules/admin/storage-maintenance.service');
const r = svc.cleanup({ dryRun: process.argv.includes('--dry-run') });
console.log('🧹 Limpeza segura de armazenamento');
console.log(`Sessões expiradas removidas: ${r.sessions.deleted}`);
console.log(`Temporários removidos: ${r.tmp.removed} (${svc.formatBytes(r.tmp.bytes)})`);
console.log(`Logs antigos removidos: ${r.logs.removed} (${svc.formatBytes(r.logs.bytes)})`);
console.log(`PDFs temporários antigos removidos: ${r.pdfs.removed} (${svc.formatBytes(r.pdfs.bytes)})`);
console.log(`Livre antes/depois: ${svc.formatBytes(r.before.free)} -> ${svc.formatBytes(r.after.free)}`);
