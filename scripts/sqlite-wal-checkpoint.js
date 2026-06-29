#!/usr/bin/env node
const svc = require('../modules/admin/storage-maintenance.service');
console.log('Checkpoint WAL seguro (TRUNCATE)');
console.log(JSON.stringify(svc.checkpointWal(), null, 2));
