const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const enabled of [false, true]) {
  test(`purgadores GPIO: driver ${enabled ? 'habilitado LOW, partida desarmada' : 'desabilitado, sem acesso elétrico'}`, (t) => {
    const compiler = spawnSync('g++', ['--version'], { encoding: 'utf8' });
    if (compiler.error?.code === 'ENOENT') return t.skip('g++ indisponível para validar driver com stub Arduino.');
    assert.equal(compiler.status, 0, compiler.stderr);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgd-purge-outputs-'));
    try {
      // Copy the production driver unchanged. Shims supply only Arduino I/O and
      // the two explicit compile configurations; no valve hardware is accessed.
      const firmware = path.join(__dirname, '../firmware/esp32-sinaleiros');
      fs.copyFileSync(path.join(firmware, 'purge_outputs.h'), path.join(directory, 'purge_outputs.h'));
      fs.copyFileSync(path.join(firmware, 'purge_timer.h'), path.join(directory, 'purge_timer.h'));
      fs.writeFileSync(path.join(directory, 'Arduino.h'), `#pragma once
#include <stdint.h>
#define LOW 0
#define HIGH 1
#define OUTPUT 1
void digitalWrite(int, int);
void pinMode(int, int);
`);
      fs.writeFileSync(path.join(directory, 'hardware_config.h'), `#pragma once
#define CGD_ENABLE_PURGE_OUTPUTS ${enabled ? 1 : 0}
#define CGD_PURGE_RELAY_ACTIVE_LEVEL LOW
#define CGD_PURGE_FAIL_CLOSED_CONFIRMED 1
`);
      const binary = path.join(directory, 'purge-outputs-test');
      const source = path.join(firmware, 'tests/purge_outputs_test.cpp');
      const build = spawnSync('g++', ['-std=c++11', '-Wall', '-Wextra', '-Werror', '-I', directory, source, '-o', binary], { encoding: 'utf8' });
      assert.equal(build.status, 0, build.stderr);
      const run = spawnSync(binary, [], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr || run.stdout);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
