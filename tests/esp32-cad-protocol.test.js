const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('firmware: envelope real SUPERVISAO aceita origem SIM, zero °C e rejeita pacote incompleto/inválido', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/esp32/cad-simulation-envelope.json'), 'utf8'));
  const s = fixture.sinaleiro_bancada;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgd-cad-protocol-'));
  const q = value => typeof value === 'string' ? JSON.stringify(value) : 'nullptr';
  const boolean = value => value === true ? 'true' : 'false';
  const source = `#include ${JSON.stringify(path.resolve(__dirname, '../firmware/esp32-sinaleiros/cad_simulation_protocol.h'))}
#include <assert.h>
int main(){
 cgd::CadSimulationPacket fixture;
 fixture.wrapperMode=${q(fixture.modo)}; fixture.origin=${q(s.origem)};
 fixture.benchMarker=${boolean(s.bancada === true)};fixture.processDisabled=${boolean(s.processo_habilitado === false)};
 fixture.digestorTyped=true;fixture.digestor=${s.digestor_id};fixture.validityTyped=true;fixture.validity=${s.validade_ms};
 fixture.phaseName=${q(s.fase)};fixture.temperatureTyped=true;fixture.temperature=${s.temperatura_c};
 fixture.rangeName=${q(s.faixa_temperatura)};fixture.colorName=${q(s.cor_sinaleiro)};
 fixture.readyTyped=true;fixture.ready=${boolean(s.pronto_descarga)};fixture.versionTyped=true;fixture.version=${s.versao_fase};
 fixture.stateAvailableTyped=true;fixture.stateAvailable=${boolean(s.estado_simulacao_disponivel)};
 fixture.heatingTyped=true;fixture.heating=${boolean(s.aquecimento_simulado)};
 fixture.camisa=${q(s.purgadores_simulados.camisa)};fixture.eixo=${q(s.purgadores_simulados.eixo)};
 cgd::CadSimulationCommand result;
 assert(cgd::validateCadSimulation(fixture,1,result)); assert(result.active&&result.completeState&&result.heating&&result.purgeOpen[0]&&!result.purgeOpen[1]);
 auto p=fixture;p.wrapperMode="SIMULACAO";assert(cgd::validateCadSimulation(p,1,result));
 p=fixture;p.origin="REAL";assert(!cgd::validateCadSimulation(p,1,result));
 p=fixture;p.origin=nullptr;assert(!cgd::validateCadSimulation(p,1,result));
 p=fixture;p.benchMarker=false;assert(!cgd::validateCadSimulation(p,1,result));
 p=fixture;p.processDisabled=false;assert(!cgd::validateCadSimulation(p,1,result));
 p=fixture;assert(!cgd::validateCadSimulation(p,2,result));
 p=fixture;p.validity=0;assert(!cgd::validateCadSimulation(p,1,result));
 p=fixture;p.validity=6501;assert(!cgd::validateCadSimulation(p,1,result));
 p=fixture;p.temperatureTyped=false;assert(!cgd::validateCadSimulation(p,1,result));
 p=fixture;p.colorName="VERDE";assert(!cgd::validateCadSimulation(p,1,result));
 p=fixture;p.camisa=nullptr;assert(!cgd::validateCadSimulation(p,1,result));
 p=fixture;p.camisa=nullptr;p.stateAvailable=false;assert(cgd::validateCadSimulation(p,1,result)&&!result.completeState&&!result.purgeOpen[0]);
 p=fixture;p.temperature=0;p.phaseName="INICIO";p.rangeName="BAIXA";p.colorName="VERDE";assert(cgd::validateCadSimulation(p,1,result)&&result.temperature==0);
 p=fixture;p.phaseName="PARADO";p.validity=0;assert(cgd::validateCadSimulation(p,1,result)&&!result.active);
}`;
  try {
    const cpp = path.join(dir, 'protocol.cpp'); const binary = path.join(dir, 'protocol');
    fs.writeFileSync(cpp, source);
    const compile = spawnSync('g++', ['-std=c++11', '-Wall', '-Wextra', '-Werror', cpp, '-o', binary], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr || String(compile.error || ''));
    const run = spawnSync(binary, [], { encoding: 'utf8' }); assert.equal(run.status, 0, run.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
