#!/usr/bin/env node
const svc = require('../modules/admin/storage-maintenance.service');
const r = svc.optimizeVacuum();
console.log(`SQLite otimizado. Banco: ${svc.formatBytes(r.before)} -> ${svc.formatBytes(r.after)}`);
