#!/usr/bin/env node
const media = require('../modules/admin/media-volume.service');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--confirm');
const confirm = args.includes('--confirm');
const olderArg = args.find((a) => a.startsWith('--older-than-days='));
const olderThanDays = olderArg ? Number(olderArg.split('=')[1]) : 0;

if (!dryRun && !confirm) {
  console.error('Use --dry-run para simular ou --confirm para apagar imagens/vídeos.');
  process.exit(1);
}
if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
  console.error('--older-than-days deve ser um número >= 0.');
  process.exit(1);
}

const result = media.cleanupAttachments({ dryRun, confirm, olderThanDays, user: 'script' });
console.log(dryRun ? 'SIMULAÇÃO de limpeza de anexos' : 'LIMPEZA REAL de anexos');
console.log(`Pastas verificadas: ${result.stats.dirs.join(', ')}`);
console.log(`Filtro de idade: ${olderThanDays ? `mais de ${olderThanDays} dia(s)` : 'sem filtro'}`);
console.log(`Imagens: ${result.stats.imageCount} (${media.formatBytes(result.stats.imageBytes)})`);
console.log(`Vídeos: ${result.stats.videoCount} (${media.formatBytes(result.stats.videoBytes)})`);
console.log(`Candidatos: ${result.candidates}`);
console.log(`${dryRun ? 'Espaço que seria liberado' : 'Espaço liberado'}: ${media.formatBytes(result.freedBytes)}`);
console.log(`Arquivos apagados: ${result.deleted}`);
if (result.errors.length) console.log(`Erros: ${result.errors.length}`);
