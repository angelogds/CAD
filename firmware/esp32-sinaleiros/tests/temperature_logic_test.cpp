#include "../temperature_logic.h"
#include <assert.h>
#include <limits>
#include <initializer_list>
#include <stdio.h>

using namespace cgd;
int main() {
  struct Case { float t; Range range; Color color; bool ready; };
  const Case cases[] = {
    {0, Range::BAIXA, Color::VERDE, false},
    {49.99f, Range::BAIXA, Color::VERDE, false},
    {50, Range::BAIXA, Color::VERDE, false},
    {50.01f, Range::INTERMEDIARIA, Color::AMARELO, false},
    {51, Range::INTERMEDIARIA, Color::AMARELO, false},
    {99, Range::INTERMEDIARIA, Color::AMARELO, false},
    {99.99f, Range::INTERMEDIARIA, Color::AMARELO, false},
    {100, Range::ALTA, Color::VERMELHO, false},
    {120, Range::ALTA, Color::VERMELHO, false},
    {120.01f, Range::PRONTO, Color::VERMELHO_PISCANDO, true},
    {150, Range::PRONTO, Color::VERMELHO_PISCANDO, true},
    {850, Range::PRONTO, Color::VERMELHO_PISCANDO, true},
  };
  for (const auto& test : cases) {
    const auto signal = classify(test.t);
    assert(signal.hasTemperature && signal.temperatureC == test.t);
    assert(signal.range == test.range && signal.color == test.color && signal.ready == test.ready);
    const auto off = requestedPins(signal, 0, false);
    assert(!off.green && !off.yellow && !off.red); // Physical outputs opt in.
  }
  for (float invalid : {-0.01f, 850.01f, 9999.0f, NAN, INFINITY, -INFINITY}) {
    const auto signal = classify(invalid);
    const auto pins = requestedPins(signal, 0, true);
    assert(!signal.hasTemperature && !signal.ready && signal.color == Color::DESLIGADO);
    assert(signal.sensorStatus == SensorStatus::FALHA);
    assert(!pins.green && !pins.yellow && !pins.red);
  }
  for (auto status : {SensorStatus::SEM_SENSOR, SensorStatus::SEM_SINAL, SensorStatus::FALHA}) {
    const auto signal = classify(130, status); // A fault cannot retain the last "ready" state.
    assert(!signal.hasTemperature && !signal.ready && isnan(signal.temperatureC));
    assert(signal.sensorStatus == status);
  }
  assert(requestedPins(classify(121), 0, true).red);
  assert(requestedPins(classify(121), 499, true).red);
  assert(!requestedPins(classify(121), 500, true).red);
  assert(!requestedPins(classify(121), 999, true).red);
  assert(requestedPins(classify(121), 1000, true).red);
  assert(requestedPins(classify(120), 999, true).red); // High range stays fixed.
  auto green = requestedPins(classify(50), 0, true);
  assert(green.green && !green.red && !green.yellow);
  auto yellow = requestedPins(classify(99), 0, true);
  assert(yellow.yellow && !yellow.green && !yellow.red);

  LocalSignals real(Mode::REAL);
  assert(!real.current(0).hasTemperature);
  assert(real.sampleReal(121, SensorStatus::VALIDO, 10));
  assert(real.current(10).ready);
  assert(!real.simulate(0, 20, 6500)); // No remote color command can override REAL.
  assert(real.current(20).ready);
  assert(!real.stopSimulation());
  assert(real.current(20).ready);
  assert(real.current(1260).ready);
  assert(!real.current(1261).ready); // Abandoned acquisition is safe without HTTP involvement.
  assert(real.current(1261).sensorStatus == SensorStatus::SEM_SINAL);
  assert(real.sampleReal(120, SensorStatus::VALIDO, 1270));
  assert(real.current(1270).color == Color::VERMELHO && !real.current(1270).ready);
  assert(real.sampleReal(130, SensorStatus::FALHA, 1280));
  assert(!real.current(1280).ready && !real.current(1280).hasTemperature);

  LocalSignals sim(Mode::SIMULACAO);
  assert(!sim.sampleReal(121, SensorStatus::VALIDO, 0));
  assert(!sim.simulate(121, 0, 0));
  assert(!sim.simulate(121, 0, 6501));
  assert(sim.simulate(121, UINT32_MAX - 10U, 500));
  assert(sim.current(0).ready); // Timer wrap does not expire a fresh simulation.
  assert(!sim.current(501).ready);
  assert(sim.current(501).color == Color::DESLIGADO);
  assert(sim.simulate(121, 1000, 6500));
  assert(sim.current(1000).ready);
  assert(sim.stopSimulation());
  assert(!sim.current(1000).ready && sim.current(1000).color == Color::DESLIGADO);
  puts("temperature_logic: boundaries, faults, blink, mode isolation and expiry passed");
}
