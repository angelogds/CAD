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
    const binary=path.join(directory,process.platform==='win32'?'bench-test.exe':'bench-test');
    const build=spawnSync('g++',['-std=c++11','-Wall','-Wextra','-Werror','-I',directory,
      path.join(__dirname,'../firmware/esp32-sinaleiros/tests/v12_bench_leds_test.cpp'),'-o',binary],{encoding:'utf8'});
    assert.equal(build.status,0,build.stderr||build.stdout);
    const run=spawnSync(binary,[],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr||run.stdout);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
