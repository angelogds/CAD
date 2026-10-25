#ifndef CGD_TEMPERATURE_LOGIC_H
#define CGD_TEMPERATURE_LOGIC_H

#include <math.h>
#include <stdint.h>

// Portable core: no Wi-Fi, HTTP, GPIO or Arduino dependency.
namespace cgd {
enum class Mode { SIMULACAO, REAL };
enum class SensorStatus { SEM_SENSOR, SEM_SINAL, VALIDO, FALHA };
enum class Range { SENSOR_INDISPONIVEL, BAIXA, INTERMEDIARIA, ALTA, PRONTO };
enum class Color { DESLIGADO, VERDE, AMARELO, VERMELHO, VERMELHO_PISCANDO };

struct Signal {
  bool hasTemperature;
  float temperatureC;
  SensorStatus sensorStatus;
  Range range;
  Color color;
  bool ready;
};
struct Pins { bool green; bool yellow; bool red; };

inline Signal unavailable(SensorStatus status = SensorStatus::SEM_SINAL) {
  return {false, NAN, status == SensorStatus::VALIDO ? SensorStatus::FALHA : status,
          Range::SENSOR_INDISPONIVEL, Color::DESLIGADO, false};
}

inline Signal classify(float temperatureC, SensorStatus status = SensorStatus::VALIDO) {
  if (status != SensorStatus::VALIDO) return unavailable(status);
  // Negative and nonfinite readings never become "cold/green" or "ready".
  if (!isfinite(temperatureC) || temperatureC < 0.0f || temperatureC > 850.0f) return unavailable(SensorStatus::FALHA);
  if (temperatureC <= 50.0f)
    return {true, temperatureC, status, Range::BAIXA, Color::VERDE, false};
  // Continuous PT100 readings have decimals: 50 < T < 100 closes integer-label gaps.
  if (temperatureC < 100.0f)
    return {true, temperatureC, status, Range::INTERMEDIARIA, Color::AMARELO, false};
  if (temperatureC <= 120.0f)
    return {true, temperatureC, status, Range::ALTA, Color::VERMELHO, false};
  return {true, temperatureC, status, Range::PRONTO, Color::VERMELHO_PISCANDO, true};
}

inline const char* name(Range range) {
  switch (range) {
    case Range::BAIXA: return "BAIXA";
    case Range::INTERMEDIARIA: return "INTERMEDIARIA";
    case Range::ALTA: return "ALTA";
    case Range::PRONTO: return "PRONTO";
    default: return "SENSOR_INDISPONIVEL";
  }
}
inline const char* name(Color color) {
  switch (color) {
    case Color::VERDE: return "VERDE";
    case Color::AMARELO: return "AMARELO";
    case Color::VERMELHO: return "VERMELHO";
    case Color::VERMELHO_PISCANDO: return "VERMELHO_PISCANDO";
    default: return "DESLIGADO";
  }
}
inline const char* name(SensorStatus status) {
  switch (status) {
    case SensorStatus::SEM_SENSOR: return "SEM_SENSOR";
    case SensorStatus::SEM_SINAL: return "SEM_SINAL";
    case SensorStatus::VALIDO: return "VALIDO";
    default: return "FALHA";
  }
}
inline const char* phase(const Signal& signal) {
  switch (signal.range) {
    case Range::BAIXA: return "INICIO";
    case Range::INTERMEDIARIA:
    case Range::ALTA: return "MEIO"; // Explicit range/color disambiguates the historical phase.
    case Range::PRONTO: return "FINAL";
    default: return "PARADO";
  }
}

inline Pins requestedPins(const Signal& signal, uint32_t nowMs, bool outputsEnabled) {
  if (!outputsEnabled || !signal.hasTemperature) return {false, false, false};
  return {
    signal.color == Color::VERDE,
    signal.color == Color::AMARELO,
    signal.color == Color::VERMELHO ||
      (signal.color == Color::VERMELHO_PISCANDO && nowMs % 1000U < 500U)
  };
}

inline bool fresh(uint32_t nowMs, uint32_t sampledAtMs, uint32_t timeoutMs) {
  // Unsigned subtraction preserves elapsed time across millis() rollover.
  return static_cast<uint32_t>(nowMs - sampledAtMs) <= timeoutMs;
}

// Local owner of the signal state. Network code may only submit simulation values.
// REAL readings and GPIO application must execute in the local acquisition task.
class LocalSignals {
 public:
  explicit LocalSignals(Mode mode)
      : mode_(mode), signal_(unavailable(SensorStatus::SEM_SENSOR)), sampledAt_(0),
        timeout_(0), acquired_(false) {}
  bool sampleReal(float temperatureC, SensorStatus sensorStatus, uint32_t nowMs) {
    if (mode_ != Mode::REAL) return false;
    signal_ = classify(temperatureC, sensorStatus);
    sampledAt_ = nowMs;
    timeout_ = 1250U;
    acquired_ = true;
    return true;
  }
  bool simulate(float temperatureC, uint32_t nowMs, uint32_t validityMs) {
    if (mode_ != Mode::SIMULACAO || validityMs == 0 || validityMs > 6500U) return false;
    signal_ = classify(temperatureC);
    sampledAt_ = nowMs;
    timeout_ = validityMs;
    acquired_ = true;
    return true;
  }
  bool stopSimulation() {
    if (mode_ != Mode::SIMULACAO) return false;
    signal_ = unavailable(SensorStatus::SEM_SINAL); acquired_ = false; return true;
  }
  Signal current(uint32_t nowMs) const {
    if (!acquired_) return unavailable(SensorStatus::SEM_SENSOR);
    if (!fresh(nowMs, sampledAt_, timeout_)) return unavailable(SensorStatus::SEM_SINAL);
    return signal_;
  }
  Mode mode() const { return mode_; }
 private:
  const Mode mode_;
  Signal signal_;
  uint32_t sampledAt_;
  uint32_t timeout_;
  bool acquired_;
};
}  // namespace cgd
#endif
