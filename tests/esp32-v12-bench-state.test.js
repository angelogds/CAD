'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('V12 executa o núcleo C++ do sketch: espelhamento, falhas, testes isolados e rollover',t=>{
  const compiler=spawnSync('g++',['--version'],{encoding:'utf8'});
  if(compiler.error?.code==='ENOENT')return t.skip('g++ indisponível para executar o núcleo V12.');
  assert.equal(compiler.status,0,compiler.stderr);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cgd-v12-bench-'));
  try{
    const source=fs.readFileSync(path.join(__dirname,'../firmware/releases/CampoDoGado_ESP32_V12_Bancada_Reles.ino'),'utf8');
    const core=source.split('// ===== bench_leds.h =====')[1]?.split('// ===== bench_leds_end =====')[0];
    assert.ok(core,'O teste deve compilar o núcleo real do sketch entregue.');
    fs.writeFileSync(path.join(directory,'bench_leds.h'),`#pragma once\n#include <stdint.h>\n${core}`);
    fs.writeFileSync(path.join(directory,'Arduino.h'),`#pragma once\n#include <stdint.h>\n#define LOW 0\n#define HIGH 1\n#define OUTPUT 1\n#define INPUT_PULLUP 2\nvoid digitalWrite(int,int);\nint digitalRead(int);\nvoid pinMode(int,int);\nuint32_t millis();\n`);
    const config=source.match(/^#define CGD_(?:ENABLE_PURGE_OUTPUTS|ENABLE_MATERIAL_GATE_OUTPUTS|PURGE_RELAY_ACTIVE_LEVEL|PURGE_FAIL_CLOSED_CONFIRMED|GATE_\w+)[^\r\n]*/gm).join('\n');
    const purges=source.split('// ===== purge_outputs.h =====')[1].split('// ===== cad_purge_test.h =====')[0];
    const gates=source.slice(source.indexOf('bool benchPinsCompatible=false;'),source.indexOf('CgdGatePulse cgdGate;'));
    fs.writeFileSync(path.join(directory,'bench_drivers.h'),`#pragma once\n#include <Arduino.h>\n${config}\n${purges}\n${gates}`);
    const binary=path.join(directory,process.platform==='win32'?'bench-test.exe':'bench-test');
    const build=spawnSync('g++',['-std=c++11','-Wall','-Wextra','-Werror','-I',directory,
      path.join(__dirname,'../firmware/esp32-sinaleiros/tests/v12_bench_leds_test.cpp'),'-o',binary],{encoding:'utf8'});
    assert.equal(build.status,0,build.stderr||build.stdout);
    const run=spawnSync(binary,[],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr||run.stdout);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
