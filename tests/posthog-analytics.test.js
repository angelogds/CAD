const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('PostHog fica inativo sem token e é configurado por variáveis de ambiente', () => {
  const server = read('server.js');
  const layout = read('views/layout.ejs');
  const analytics = read('public/js/analytics-posthog.js');

  assert.match(server, /POSTHOG_PUBLIC_KEY/);
  assert.match(server, /POSTHOG_HOST/);
  assert.match(layout, /__POSTHOG_CONFIG__/);
  assert.match(analytics, /if \(!token \|\| !apiHost/);
});

test('analytics não usa autocapture nem gravação de sessão e evita PII direta', () => {
  const analytics = read('public/js/analytics-posthog.js');

  assert.match(analytics, /autocapture:\s*false/);
  assert.match(analytics, /disable_session_recording:\s*true/);
  assert.match(analytics, /capture_pageview:\s*false/);
  assert.doesNotMatch(analytics, /cfg\.email|cfg\.name|user\.email|user\.name/);
  assert.doesNotMatch(analytics, /identify\s*\(/);
});

test('eventos controlados normalizam IDs de rotas e registram navegação', () => {
  const analytics = read('public/js/analytics-posthog.js');

  assert.match(analytics, /cg_page_view/);
  assert.match(analytics, /cg_sidebar_navigation/);
  assert.match(analytics, /data-analytics-event/);
  assert.match(analytics, /return ':id'/);
  assert.match(analytics, /posthog\.reset\(\)/);
});
