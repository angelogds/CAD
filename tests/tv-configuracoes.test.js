const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const routes = () => fs.readFileSync('modules/tv/tv.routes.js', 'utf8');
const service = () => fs.readFileSync('modules/tv/tv-config.service.js', 'utf8');
const view = () => fs.readFileSync('views/tv/configuracoes.ejs', 'utf8');
const migration = () => fs.readFileSync('database/migrations/210_tv_configuracoes_midias.js', 'utf8');

test('configurações do Modo TV ficam restritas a ADMIN e ENCARREGADO_MANUTENCAO', () => {
  const src = routes();
  assert.match(src, /const TV_CONFIG_ACCESS = \['ADMIN', 'ENCARREGADO_MANUTENCAO'\]/);
  assert.match(src, /router\.get\('\/tv\/configuracoes', requireLogin, requireRole\(TV_CONFIG_ACCESS\)/);
  assert.match(src, /router\.post\('\/tv\/configuracoes\/mascote-os', requireLogin, requireRole\(TV_CONFIG_ACCESS\)/);
  assert.match(src, /router\.post\('\/tv\/configuracoes\/midias', requireLogin, requireRole\(TV_CONFIG_ACCESS\)/);
});

test('upload do Modo TV aceita somente formatos visuais suportados e limita tamanho', () => {
  const src = routes();
  assert.match(src, /80 \* 1024 \* 1024/);
  for (const mime of ['image/jpeg','image/png','image/webp','video/mp4','video/webm']) {
    assert.match(src, new RegExp(mime.replace('/', '\\/')));
  }
});

test('configuração persiste mascote e biblioteca por posição entre as sete telas', () => {
  const mig = migration();
  assert.match(mig, /CREATE TABLE IF NOT EXISTS tv_configuracoes/);
  assert.match(mig, /CREATE TABLE IF NOT EXISTS tv_midias/);
  assert.match(mig, /posicao_depois_tela INTEGER NOT NULL DEFAULT 0 CHECK \(posicao_depois_tela BETWEEN 0 AND 7\)/);
  assert.match(mig, /midias_intervalo_ativas INTEGER NOT NULL DEFAULT 0/);
});

test('serviço publica somente configuração necessária ao cliente do Modo TV', () => {
  const src = service();
  assert.match(src, /mascotAlert:/);
  assert.match(src, /interstitialsEnabled:/);
  assert.match(src, /interstitials:/);
  assert.match(src, /durationMs:/);
  assert.doesNotMatch(src, /VAPID_PRIVATE|SESSION_SECRET|OPENAI_API_KEY/);
});

test('tela de configuração valida resolução mínima recomendada de 1280x720 no navegador', () => {
  const html = view();
  assert.match(html, /width >= 1280 && height >= 720/);
  assert.match(html, /Use uma mídia de pelo menos 1280×720/);
  assert.match(html, /Antes da Tela 1/);
  assert.match(html, /Depois da Tela/);
});
