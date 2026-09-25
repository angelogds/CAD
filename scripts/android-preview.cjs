const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function run(args) {
  const child = spawnSync(process.execPath, args, {
    cwd: root, stdio: 'inherit', env: { ...process.env, CAD_MOBILE_PREVIEW: '1' },
  });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status || 1);
}
run(['scripts/build-mobile-preview.cjs']);
const cap = 'node_modules/@capacitor/cli/bin/capacitor';
if (!fs.existsSync(path.join(root, 'android'))) run([cap, 'add', 'android']);
run([cap, 'sync', 'android']);
if (process.argv.includes('--open')) run([cap, 'open', 'android']);
