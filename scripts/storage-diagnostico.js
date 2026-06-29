#!/usr/bin/env node
const svc = require('../modules/admin/storage-maintenance.service');
const d = svc.diagnostic();
console.log('📦 Diagnóstico de armazenamento');
console.log(`Volume /data: ${svc.formatBytes(d.total)} total; ${svc.formatBytes(d.free)} livres`);
console.log(`Banco SQLite: ${svc.formatBytes(d.db)} (WAL ${svc.formatBytes(d.wal)}, SHM ${svc.formatBytes(d.shm)})`);
console.log(`Uploads: ${svc.formatBytes(d.uploads)}`);
console.log(`Logs: ${svc.formatBytes(d.logs)}`);
console.log(`Tmp: ${svc.formatBytes(d.tmp)}`);
console.log(`Mídias: ${svc.formatBytes(d.media)}`);
console.log(`PDFs: ${svc.formatBytes(d.pdfs)}`);
console.log(`Sessões antigas: ${d.sessions.expired} registro(s) de ${d.sessions.total} (${d.sessions.table || 'sem tabela'})`);
console.log('Maiores arquivos:');
d.topFiles.forEach(f => console.log(`- ${svc.formatBytes(f.size)} ${f.path}`));
