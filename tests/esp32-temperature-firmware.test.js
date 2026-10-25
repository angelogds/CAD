const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('firmware core: limites PT100, falhas, blink, isolamento REAL e expiração local', (t) => {
  const compiler = spawnSync('g++', ['--version'], { encoding: 'utf8' });
  if (compiler.error?.code === 'ENOENT') return t.skip('g++ indisponível: executar validação nativa do núcleo no ambiente com compilador C++.');
  assert.equal(compiler.status, 0, compiler.stderr);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgd-temperature-'));
  try {
    const binary = path.join(directory, 'temperature-test');
    const source = path.join(__dirname, '../firmware/esp32-sinaleiros/tests/temperature_logic_test.cpp');
    const build = spawnSync('g++', ['-std=c++11', '-Wall', '-Wextra', '-Werror', source, '-o', binary], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    const run = spawnSync(binary, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
