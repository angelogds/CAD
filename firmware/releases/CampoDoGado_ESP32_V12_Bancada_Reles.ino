// CAMPO DO GADO - ESP32 V12 - TESTE RELÉS BANCADA
// Exclusivo para interfaces de reles com LEDs, SEM solenoides/cilindros conectados.
// ESP32 Dev Module (core 3.3.12), ArduinoJson 7.4.3.
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <freertos/task.h>
#include <time.h>
#include <sys/time.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// Somente o módulo e a fiação confirmados devem ser habilitados.
// O ESP32-D0WD-V3 e os sinaleiros 18/19/21 ativos em LOW vieram do sketch fornecido.
#define CGD_ENABLE_PT100 0
#define CGD_PT100_SCK -1
#define CGD_PT100_MISO -1
#define CGD_PT100_MOSI -1
#define CGD_PT100_CS -1
#define CGD_PT100_WIRES 0
#define CGD_PT100_REFERENCE_OHMS 0.0f
#define CGD_PT100_NOMINAL_OHMS 100.0f
// V12: GPIO25/26 acionam exclusivamente LEDs de bancada, ativos em LOW.
// As rotas de ciclo industrial permanecem bloqueadas nesta versao.
#define CGD_ENABLE_PURGE_OUTPUTS 1
#define CGD_PURGE_RELAY_ACTIVE_LEVEL LOW
#define CGD_PURGE_FAIL_CLOSED_CONFIRMED 1

// Duas saidas, uma por rele SPDT: energizado indica ABERTA, desenergizado retorna ao NC.
// Somente LEDs de bancada; nao representa fechamento mecanico confirmado.
#define CGD_ENABLE_MATERIAL_GATE_OUTPUTS 1 // Somente LEDs de bancada, NÃO válvulas
#define CGD_GATE_FEED_CANDIDATE_GPIO 32
#define CGD_GATE_DISCHARGE_CANDIDATE_GPIO 33

// R3 bancada: os sete canais ficam disponiveis sem jumper GPIO27.
// Use 1 para exigir chave GPIO27-GND; nunca configure GPIO27 como saida.
#ifndef CGD_BENCH_REQUIRE_LOCAL_KEY
#define CGD_BENCH_REQUIRE_LOCAL_KEY 0
#endif
// Simulacao CAD exige selecao local e pacote atual; testes locais sao temporizados.
// GPIO16/17 nao sao usados nesta revisao; GPIO32=carga, GPIO33=descarga.
#define CGD_GATE_FEED_OPEN_GPIO 32
#define CGD_GATE_DISCHARGE_OPEN_GPIO 33
#define CGD_GATE_LOCAL_KEY_GPIO 27
#if CGD_BENCH_REQUIRE_LOCAL_KEY != 0 && CGD_BENCH_REQUIRE_LOCAL_KEY != 1
#error CGD_BENCH_REQUIRE_LOCAL_KEY deve ser 0 ou 1
#endif
#define CGD_GATE_RELAY_ACTIVE_LEVEL LOW



// ===== temperature_logic.h =====
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


// ===== purge_timer.h =====
#ifndef CGD_PURGE_TIMER_H
#define CGD_PURGE_TIMER_H

#include <stdint.h>

namespace cgd {
// Simulation only. This module deliberately has no GPIO, relay or valve API.
class PurgeTimer {
 public:
  struct State {
    bool active;
    bool open;
    uint32_t remainingMs;
    bool physicalOutputEnabled;
  };
  static constexpr uint32_t MAX_TICK_GAP_MS = 2000U;

  explicit PurgeTimer(uint32_t closedMinutes = 5U, uint32_t openSeconds = 60U)
      : closedMinutes_(5U), openSeconds_(60U), active_(false), open_(false),
        phaseStartedAt_(0U), lastTickAt_(0U) {
    configure(closedMinutes, openSeconds);
  }

  bool configure(uint32_t closedMinutes, uint32_t openSeconds) {
    if (closedMinutes < 1U || closedMinutes > 120U ||
        openSeconds < 1U || openSeconds > 300U) return false;
    // A valid configuration change requires a fresh explicit start.
    stop();
    closedMinutes_ = closedMinutes;
    openSeconds_ = openSeconds;
    return true;
  }
  void startSimulation(uint32_t nowMs) {
    // Always begin closed; boot/configuration never resumes an open interval.
    active_ = true;
    open_ = false;
    phaseStartedAt_ = nowMs;
    lastTickAt_ = nowMs;
  }
  void stop() {
    active_ = false;
    open_ = false;
    phaseStartedAt_ = 0U;
    lastTickAt_ = 0U;
  }
  void fault() { stop(); }

  State tick(uint32_t nowMs) {
    if (!active_) return state(nowMs);
    // The caller must service the timer locally. After a stall, stop closed
    // instead of replaying missed intervals or issuing a delayed open pulse.
    if (elapsed(nowMs, lastTickAt_) > MAX_TICK_GAP_MS) {
      stop();
      return state(nowMs);
    }
    lastTickAt_ = nowMs;
    if (elapsed(nowMs, phaseStartedAt_) >= phaseDurationMs()) {
      open_ = !open_;
      phaseStartedAt_ = nowMs;
    }
    return state(nowMs);
  }

  State state(uint32_t nowMs) const {
    if (!active_) return {false, false, 0U, false};
    // Reading status cannot advertise "open" after servicing has stalled.
    if (elapsed(nowMs, lastTickAt_) > MAX_TICK_GAP_MS)
      return {false, false, 0U, false};
    const uint32_t duration = phaseDurationMs();
    const uint32_t age = elapsed(nowMs, phaseStartedAt_);
    return {true, open_, age < duration ? duration - age : 0U, false};
  }
  bool isActive() const { return active_; }
  uint32_t closedMinutes() const { return closedMinutes_; }
  uint32_t openSeconds() const { return openSeconds_; }

 private:
  static uint32_t elapsed(uint32_t nowMs, uint32_t thenMs) {
    // millis() rollover is handled with unsigned subtraction.
    return static_cast<uint32_t>(nowMs - thenMs);
  }
  uint32_t phaseDurationMs() const {
    return open_ ? openSeconds_ * 1000U : closedMinutes_ * 60000U;
  }
  uint32_t closedMinutes_;
  uint32_t openSeconds_;
  bool active_;
  bool open_;
  uint32_t phaseStartedAt_;
  uint32_t lastTickAt_;
};
}  // namespace cgd
#endif


// ===== purge_outputs.h =====

#include <Arduino.h>

// Driver separado do temporizador: relés LOW/fecha-sem-energia confirmados pelo responsável.
// arm() exige ação local e não é persistido; ausência de energia deve fechar a válvula.
class PurgeOutputs {
 public:
  void begin() {
#if CGD_ENABLE_PURGE_OUTPUTS
    static_assert(CGD_PURGE_FAIL_CLOSED_CONFIRMED == 1,
                  "Confirme valvula normalmente fechada/fecha sem energia antes de habilitar");
    static_assert(CGD_PURGE_RELAY_ACTIVE_LEVEL == LOW || CGD_PURGE_RELAY_ACTIVE_LEVEL == HIGH,
                  "Confirme o nivel ativo do modulo de reles dos purgadores");
    for (int i = 0; i < 2; ++i) {
      digitalWrite(pin(i), inactiveLevel()); pinMode(pin(i), OUTPUT);
    }
    configured_ = true;
#endif
  }
  bool configured() const { return configured_; }
  bool armed(int channel) const { return channel >= 0 && channel < 2 && armed_[channel]; }
  bool arm(int channel) {
    if (!configured_ || channel < 0 || channel > 1) return false;
    writeOff(channel); armed_[channel] = true; return true;
  }
  void stop(int channel) {
    if (channel < 0 || channel > 1) return;
    armed_[channel] = false; writeOff(channel);
  }
  void stopAll() { stop(0); stop(1); }
  void forceOff() { writeOff(0); writeOff(1); }
  void apply(int channel, bool open, bool healthy) {
    if (channel < 0 || channel > 1) return;
    if (!healthy) { stop(channel); return; }
#if CGD_ENABLE_PURGE_OUTPUTS
    if (configured_) digitalWrite(pin(channel), armed_[channel] && open ? CGD_PURGE_RELAY_ACTIVE_LEVEL : inactiveLevel());
#else
    (void)open;
#endif
  }
  void applyBench(bool enabled,bool camisa,bool eixo) {
    if(!enabled||(camisa&&eixo)){stopAll();return;}
    const bool desired[2]={camisa,eixo};
    // Break-before-make entre canais; nao pulsa OFF no rele que permanece ligado.
    for(int i=0;i<2;i++)if(!desired[i])stop(i);
    for(int i=0;i<2;i++)if(desired[i]){
      if(!armed(i))arm(i);
      apply(i,true,true);
    }
  }
  static int pin(int channel) { return channel == 0 ? 25 : 26; }
 private:
  bool configured_ = false;
  bool armed_[2] = {false, false};
  static uint8_t inactiveLevel() { return CGD_PURGE_RELAY_ACTIVE_LEVEL == LOW ? HIGH : LOW; }
  void writeOff(int channel) {
#if CGD_ENABLE_PURGE_OUTPUTS
    if (configured_) digitalWrite(pin(channel), inactiveLevel());
#else
    (void)channel;
#endif
  }
};


// ===== cad_purge_test.h =====
#ifndef CGD_CAD_PURGE_TEST_H
#define CGD_CAD_PURGE_TEST_H

#include <stdint.h>

namespace cgd {
// Local authorization gate for CAD bench-test commands. No GPIO or transport API.
// Packet fields can request open/closed, but only a separate local arm() call
// authorizes a channel. Call update() every local cycle and immediately before
// accepting an arm action so current() reflects the latest Wi-Fi/mode/TTL state.
class CadPurgeTest {
 public:
  static constexpr uint32_t MAX_VALIDITY_MS = 6500U;
  static constexpr uint32_t MAX_UPDATE_GAP_MS = 2000U;

  bool update(bool cadMode, bool wifi, bool packetValid, uint32_t now,
              uint32_t receivedAt, uint32_t validity,
              bool camisaOpen, bool eixoOpen) {
    // A delayed local task cannot resume an energized commissioning test,
    // even when the separate network task kept receiving fresh commands.
    if (hasUpdated_ && elapsed(now, lastUpdatedAt_) > MAX_UPDATE_GAP_MS) stopAll();
    hasUpdated_ = true; lastUpdatedAt_ = now;
    // A fresh packet after a missed deadline must not revive old local arming,
    // even if no intermediate update() observed the expired command.
    if (current_ && elapsed(now, receivedAt_) > validity_) stopAll();
    const bool fresh = validity > 0U && validity <= MAX_VALIDITY_MS &&
                       elapsed(now, receivedAt) <= validity;
    if (!cadMode || !wifi || !packetValid || !fresh) {
      current_ = false;
      requested_[0] = false;
      requested_[1] = false;
      stopAll();
      return false;
    }
    current_ = true;
    receivedAt_ = receivedAt;
    validity_ = validity;
    requested_[0] = camisaOpen;
    requested_[1] = eixoOpen;
    return true;
  }
  bool arm(int channel) {
    if (!validChannel(channel) || !current_) return false;
    armed_[channel] = true;
    return true;
  }
  void stop(int channel) {
    if (validChannel(channel)) armed_[channel] = false;
  }
  void stopAll() { armed_[0] = false; armed_[1] = false; }
  bool armed(int channel) const {
    return validChannel(channel) && armed_[channel];
  }
  bool requestedOpen(int channel) const {
    return current_ && validChannel(channel) && armed_[channel] && requested_[channel];
  }
  bool current() const { return current_; }

 private:
  static bool validChannel(int channel) { return channel >= 0 && channel < 2; }
  static uint32_t elapsed(uint32_t now, uint32_t then) {
    return static_cast<uint32_t>(now - then);
  }
  bool current_ = false, hasUpdated_ = false;
  uint32_t lastUpdatedAt_ = 0U;
  bool armed_[2] = {false, false};
  bool requested_[2] = {false, false};
  uint32_t receivedAt_ = 0U;
  uint32_t validity_ = 0U;
};
}  // namespace cgd
#endif


// ===== cad_simulation_protocol.h =====

#include <stdint.h>
#include <string.h>

namespace cgd {
// DTO shared by the ArduinoJson adapter and portable CI tests. Wrapper mode is
// intentionally not an authority: device APIs may wrap this in SUPERVISAO.
struct CadSimulationPacket {
  const char* wrapperMode = nullptr;
  const char* origin = nullptr;
  bool benchMarker = false, processDisabled = false;
  bool digestorTyped = false; int digestor = 0;
  bool validityTyped = false; uint32_t validity = 0;
  const char* phaseName = nullptr;
  bool temperatureTyped = false; float temperature = NAN;
  const char* rangeName = nullptr;
  const char* colorName = nullptr;
  bool readyTyped = false, ready = false;
  bool versionTyped = false; int32_t version = -1;
  bool stateAvailableTyped = false, stateAvailable = false;
  bool heatingTyped = false, heating = false;
  const char* camisa = nullptr;
  const char* eixo = nullptr;
};
struct CadSimulationCommand {
  bool active = false;
  float temperature = NAN;
  uint32_t validity = 0;
  int32_t version = -1;
  int8_t phase = -1;
  bool completeState = false, heating = false;
  bool purgeOpen[2] = {false, false};
};
inline bool exact(const char* value, const char* expected) {
  return value && strcmp(value, expected) == 0;
}
inline bool purgeValue(const char* value) { return exact(value, "ABERTO") || exact(value, "FECHADO"); }
inline bool validateCadSimulation(const CadSimulationPacket& p, int expectedDigestor, CadSimulationCommand& out) {
  out = CadSimulationCommand();
  if (!exact(p.origin, "SIMULACAO") || !p.benchMarker || !p.processDisabled ||
      !p.digestorTyped || p.digestor != expectedDigestor || expectedDigestor < 1 || expectedDigestor > 4 ||
      !p.validityTyped || p.validity > 6500U) return false;
  if (exact(p.phaseName, "PARADO")) return true;
  if (p.validity == 0 || !p.temperatureTyped || !p.versionTyped || p.version < 0) return false;
  const auto signal = classify(p.temperature);
  if (!signal.hasTemperature || !exact(p.phaseName, phase(signal)) || !exact(p.rangeName, name(signal.range)) ||
      !exact(p.colorName, name(signal.color)) || !p.readyTyped || p.ready != signal.ready) return false;
  const bool fullState = p.stateAvailableTyped && p.stateAvailable;
  if (fullState && (!p.heatingTyped || !purgeValue(p.camisa) || !purgeValue(p.eixo))) return false;
  out.active = true; out.temperature = p.temperature; out.validity = p.validity;
  out.version = p.version; out.phase = exact(p.phaseName,"INICIO") ? 0 : (exact(p.phaseName,"MEIO") ? 1 : 2);
  out.completeState = fullState; out.heating = fullState && p.heating;
  out.purgeOpen[0] = fullState && exact(p.camisa, "ABERTO");
  out.purgeOpen[1] = fullState && exact(p.eixo, "ABERTO");
  return true;
}
}


// ===== cad_simulation_json.h =====

#include <ArduinoJson.h>

namespace cgd {
inline bool parseCadSimulationJson(const char* body, size_t length, int digestor, CadSimulationCommand& out) {
  out = CadSimulationCommand();
  if (!body || length > 4096) return false;
  JsonDocument doc;
  if (deserializeJson(doc, body, length, DeserializationOption::NestingLimit(8)) ||
      !doc["sinaleiro_bancada"].is<JsonObject>()) return false;
  JsonObject s = doc["sinaleiro_bancada"].as<JsonObject>();
  CadSimulationPacket p;
  p.wrapperMode = doc["modo"].as<const char*>(); p.origin = s["origem"].as<const char*>();
  p.benchMarker = s["bancada"].is<bool>() && s["bancada"].as<bool>();
  p.processDisabled = s["processo_habilitado"].is<bool>() && !s["processo_habilitado"].as<bool>();
  p.digestorTyped = s["digestor_id"].is<int>(); p.digestor = s["digestor_id"].as<int>();
  p.validityTyped = s["validade_ms"].is<uint32_t>(); p.validity = s["validade_ms"].as<uint32_t>();
  p.phaseName = s["fase"].as<const char*>(); p.temperatureTyped = s["temperatura_c"].is<float>();
  p.temperature = s["temperatura_c"].as<float>(); p.rangeName = s["faixa_temperatura"].as<const char*>();
  p.colorName = s["cor_sinaleiro"].as<const char*>(); p.readyTyped = s["pronto_descarga"].is<bool>();
  p.ready = s["pronto_descarga"].as<bool>(); p.versionTyped = s["versao_fase"].is<int32_t>();
  p.version = s["versao_fase"].as<int32_t>();
  p.stateAvailableTyped = s["estado_simulacao_disponivel"].is<bool>();
  p.stateAvailable = s["estado_simulacao_disponivel"].as<bool>();
  p.heatingTyped = s["aquecimento_simulado"].is<bool>(); p.heating = s["aquecimento_simulado"].as<bool>();
  p.camisa = s["purgadores_simulados"]["camisa"].as<const char*>();
  p.eixo = s["purgadores_simulados"]["eixo"].as<const char*>();
  return validateCadSimulation(p, digestor, out);
}
}


// ===== pt100_max31865.h =====

#include <Arduino.h>
#include <SPI.h>


// SPI MAX31865 contínuo: aquisição não contém delay nem espera HTTP.
// Validação da aplicação física/calibração deve anteceder CGD_ENABLE_PT100=1.
class Pt100Reader {
 public:
  void begin() {
#if CGD_ENABLE_PT100
    static_assert(CGD_PT100_SCK >= 0 && CGD_PT100_MISO >= 0 && CGD_PT100_MOSI >= 0 && CGD_PT100_CS >= 0,
                  "Configure os quatro pinos SPI do PT100 antes de habilitar");
    static_assert(CGD_PT100_WIRES == 2 || CGD_PT100_WIRES == 3 || CGD_PT100_WIRES == 4,
                  "Confirme PT100 de 2, 3 ou 4 fios");
    static_assert(CGD_PT100_REFERENCE_OHMS > 0 && CGD_PT100_NOMINAL_OHMS > 0,
                  "Confirme resistencia de referencia e nominal do modulo");
    const int pins[] = {CGD_PT100_SCK, CGD_PT100_MISO, CGD_PT100_MOSI, CGD_PT100_CS};
    for (int i = 0; i < 4; ++i) {
      if (pins[i] == 18 || pins[i] == 19 || pins[i] == 21 || pins[i] == 25 || pins[i] == 26 ||
          pins[i] == 16 || pins[i] == 17 || pins[i] == 27 || pins[i] == 32 || pins[i] == 33 ||
          pins[i] < 0 || pins[i] > 39 || (pins[i] >= 6 && pins[i] <= 11)) return;
      for (int j = 0; j < i; ++j) if (pins[i] == pins[j]) return;
    }
    if (CGD_PT100_SCK >= 34 || CGD_PT100_MOSI >= 34 || CGD_PT100_CS >= 34) return;
    digitalWrite(CGD_PT100_CS, HIGH);
    pinMode(CGD_PT100_CS, OUTPUT);
    SPI.begin(CGD_PT100_SCK, CGD_PT100_MISO, CGD_PT100_MOSI, CGD_PT100_CS);
    // VBIAS + conversão contínua + filtro 50Hz + opção 3 fios + clear fault.
    config_ = 0x80 | 0x40 | 0x01 | (CGD_PT100_WIRES == 3 ? 0x10 : 0);
    writeRegister(0x00, config_ | 0x02);
    startedAt_ = millis();
    configured_ = true;
#endif
  }
  bool configured() const { return configured_; }
  cgd::Signal read() {
#if CGD_ENABLE_PT100
    if (!configured_) return cgd::unavailable(cgd::SensorStatus::SEM_SENSOR);
    if (millis() - startedAt_ < 100) return cgd::unavailable(cgd::SensorStatus::SEM_SINAL);
    SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE1));
    digitalWrite(CGD_PT100_CS, LOW);
    SPI.transfer(0x01);
    const uint8_t msb = SPI.transfer(0);
    const uint8_t lsb = SPI.transfer(0);
    const uint16_t raw = (uint16_t(msb) << 8) | lsb;
    digitalWrite(CGD_PT100_CS, HIGH);
    SPI.endTransaction();
    const uint8_t faults = readRegister(0x07);
    if ((raw & 1U) || faults || raw == 0 || (raw >> 1) == 0x7fff) {
      writeRegister(0, config_ | 0x02);
      return cgd::unavailable(cgd::SensorStatus::FALHA);
    }
    const float resistance = (raw >> 1) * CGD_PT100_REFERENCE_OHMS / 32768.0f;
    constexpr float A = 3.9083e-3f;
    constexpr float B = -5.775e-7f;
    const float discriminant = A * A - 4 * B * (1 - resistance / CGD_PT100_NOMINAL_OHMS);
    if (discriminant < 0) return cgd::unavailable(cgd::SensorStatus::FALHA);
    const float temperature = (-A + sqrtf(discriminant)) / (2 * B);
    return cgd::classify(temperature);
#else
    return cgd::unavailable(cgd::SensorStatus::SEM_SENSOR);
#endif
  }
 private:
  bool configured_ = false;
#if CGD_ENABLE_PT100
  uint32_t startedAt_ = 0;
  uint8_t config_ = 0;
  void writeRegister(uint8_t address, uint8_t value) {
    SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE1));
    digitalWrite(CGD_PT100_CS, LOW); SPI.transfer(address | 0x80); SPI.transfer(value);
    digitalWrite(CGD_PT100_CS, HIGH); SPI.endTransaction();
  }
  uint8_t readRegister(uint8_t address) {
    SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE1));
    digitalWrite(CGD_PT100_CS, LOW); SPI.transfer(address & 0x7f);
    const uint8_t value = SPI.transfer(0);
    digitalWrite(CGD_PT100_CS, HIGH); SPI.endTransaction(); return value;
  }
#endif
};


// IHM LAN: configuração local de Wi-Fi/token com POST guardado; segredos nunca são devolvidos.
// V12: espelhamento de LEDs isolado dos temporizadores/PT100 e das rotas industriais.
const char LOCAL_UI[] PROGMEM = R"LOCALHTML(<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>2A Automação Industrial · IHM Digestores</title>
<style>
:root{font:100%/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18191c;background:#f4f5f7;--red:#ba1931;--line:#e3e5e9;--muted:#5b606b;--radius:18px}*{box-sizing:border-box}body{margin:0}button{font:inherit}button:focus-visible,a:focus-visible{outline:3px solid #ba1931;outline-offset:4px}header{background:#fff;border-bottom:1px solid var(--line)}.wrap{width:min(1160px,calc(100% - 40px));margin:auto}.brandbar{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:25px 0}.brand{display:flex;gap:15px;align-items:center}.monogram{display:grid;place-items:center;flex:none;width:52px;height:52px;border-radius:14px;background:var(--red);color:#fff;font-size:1.45rem;line-height:1;font-weight:850;letter-spacing:-.07em}.brand strong{font-size:1.13rem;letter-spacing:-.025em}.byline{font-size:.76rem;color:var(--muted);margin-top:3px}.local{color:var(--muted);font-size:.8rem}.local b{display:block;color:#27292e;letter-spacing:.09em;font-size:.65rem;text-transform:uppercase}.topline{display:flex;justify-content:space-between;align-items:center;gap:24px;margin:31px 0 20px}h1{font-size:clamp(1.6rem,3vw,2.1rem);line-height:1.15;letter-spacing:-.045em;margin:5px 0 6px}.eyebrow{font-size:.65rem;letter-spacing:.13em;text-transform:uppercase;font-weight:750;color:var(--muted)}p{margin:0}.sub{font-size:.86rem;color:var(--muted)}.refresh{background:#fff;border:1px solid #d7dae0;border-radius:10px;padding:9px 16px;cursor:pointer;font-size:.8rem;font-weight:650;white-space:nowrap}.refresh:active{background:#eceef2}.connection{display:flex;align-items:center;gap:7px;font-size:.72rem;color:var(--muted);margin-top:8px;justify-content:flex-end}.dot{width:7px;height:7px;border-radius:50%;background:#9095a0}.online .dot{background:#1c7a54}.offline .dot{background:var(--red)}.grid{display:grid;grid-template-columns:1.5fr 1fr;gap:18px}.card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:25px;min-width:0}.hero{position:relative;overflow:hidden}.cardhead{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}h2{font-size:.84rem;letter-spacing:-.01em;margin:0}.badge{background:#f0f1f4;border:1px solid #e2e4e8;border-radius:6px;font-size:.62rem;font-weight:750;letter-spacing:.06em;padding:4px 8px;white-space:nowrap}.badge.real{background:#fdeef1;color:#9f152a;border-color:#f3cdd5}.temperature{font-size:clamp(4rem,8vw,6.5rem);line-height:1;letter-spacing:-.075em;font-weight:730;margin:27px 0 12px;font-variant-numeric:tabular-nums}.unit{font-size:1.55rem;color:#747985;letter-spacing:-.03em;vertical-align:top;display:inline-block;margin:14px 0 0 10px;font-weight:500}.measurelabel{color:var(--muted);font-size:.76rem;min-height:1.5em}.range{display:flex;gap:5px;margin:28px 0 8px}.range span{height:5px;border-radius:3px;flex:1;background:#e5e7eb}.range span.active{background:var(--red)}.rangecaptions{display:flex;justify-content:space-between;font-size:.62rem;color:#727784;gap:8px}.statfoot{margin-top:23px;padding-top:15px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;font-size:.7rem;color:var(--muted)}.statfoot b{font-weight:650;color:#30333b}.signal{display:flex;align-items:center;gap:25px;margin:25px 0}.tower{background:#f3f4f6;border:1px solid #e2e4e9;display:flex;flex-direction:column;gap:9px;padding:12px;border-radius:30px;flex:none}.lamp{width:29px;height:29px;background:#dfe1e6;border:1px solid #d0d3da;border-radius:50%}.lamp.green.active{background:#198754;border-color:#166b45;box-shadow:0 0 0 4px #19875412}.lamp.yellow.active{background:#e8ae19;border-color:#b6870c;box-shadow:0 0 0 4px #e8ae1912}.lamp.red.active{background:#c41e38;border-color:#a91a30;box-shadow:0 0 0 4px #c41e3812}.lamp.blink{animation:pulse 1s step-end infinite}.signalname{font-weight:750;font-size:1.3rem;letter-spacing:-.035em;line-height:1.2;margin:0 0 7px}.signaldesc{font-size:.79rem;color:var(--muted)}.ready{border:1px solid #e5e7eb;background:#f7f8fa;padding:11px 13px;border-radius:10px;font-size:.76rem;font-weight:650;margin:18px 0 13px}.ready.active{background:#fff1f3;color:#a4152b;border-color:#f2c3cd}.output{font-size:.72rem;color:var(--muted)}.output b{color:#323640}.details{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:18px}.details .card{padding:21px}.details h2{margin-bottom:17px}.rows{margin:0}.rows div{display:flex;justify-content:space-between;gap:15px;padding:9px 0;border-bottom:1px solid #f0f1f4;font-size:.72rem}.rows div:last-child{border:0}.rows dt{color:var(--muted);flex:none}.rows dd{margin:0;text-align:right;font-weight:600;overflow-wrap:anywhere;min-width:0}.note{font-size:.69rem;line-height:1.6;color:var(--muted);margin-top:15px}.safety{display:flex;gap:14px;background:#fff;border:1px solid #e2e4e9;border-left:3px solid var(--red);padding:17px 21px;border-radius:10px;margin:20px 0 30px}.safety strong{display:block;font-size:.76rem;margin-bottom:3px}.safety p{color:var(--muted);font-size:.72rem}.safetyicon{color:var(--red);font-size:1rem;font-weight:800}.footer{display:flex;justify-content:space-between;gap:20px;padding:0 0 24px;font-size:.65rem;color:#747985}.offline-label{color:var(--red)}@keyframes pulse{50%{opacity:.25}}.control[hidden]{display:none}
@media(prefers-reduced-motion:reduce){.lamp.blink{animation:none}}@media(min-width:800px){.hero{min-height:338px}}@media(max-width:760px){.grid{grid-template-columns:1fr}.details{grid-template-columns:1fr}.brandbar{padding:18px 0}.local{display:none}.wrap{width:calc(100% - 28px)}.card{padding:22px}.topline{gap:12px;margin-top:23px}.refresh{padding:8px 10px}.sub{max-width:240px}.temperature{font-size:5.5rem}.brand strong{font-size:1rem}.byline{font-size:.65rem}.monogram{width:45px;height:45px}.footer{flex-direction:column;gap:5px}.signal{margin:18px 0}.statfoot{flex-wrap:wrap}}@media(prefers-contrast:more){:root{--muted:#353943;--line:#a8adb7}.card{border-color:#a8adb7}.rows div{border-color:#c8cbd2}}

.dashboard{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.digestor-card{padding:22px;position:relative}.digestor-card.linked{border-color:#cf7887;box-shadow:0 4px 20px #171b2406}.digestor-card.unlinked{background:#fafbfc;color:#656b77}.digestor-top{display:flex;align-items:center;justify-content:space-between;gap:12px}.digestor-title{display:flex;align-items:center;gap:11px}.number{width:32px;height:32px;display:grid;place-items:center;background:#eceef2;border-radius:9px;font-weight:750;font-size:.8rem}.linked .number{background:#fce7ec;color:#a81c34}.digestor-body{display:flex;align-items:center;gap:18px;margin:17px 0}.digestor-visual{width:36%;min-width:100px;color:#9da4af}.digestor-visual svg{width:100%;display:block}.digestor-temp{font-size:clamp(2.8rem,5vw,4rem);line-height:1;letter-spacing:-.065em;font-weight:730;font-variant-numeric:tabular-nums}.digestor-unit{font-size:1.1rem;letter-spacing:-.02em;color:#747b86;font-weight:500}.digestor-desc{font-size:.72rem;color:var(--muted);margin-top:8px}.digestor-bottom{display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px solid var(--line);padding-top:13px;margin-top:12px}.smalltower{display:flex;gap:5px;align-items:center}.smalltower .lamp{width:17px;height:17px}.signaltext{font-size:.72rem;font-weight:650;margin-left:5px}.readystatus{font-size:.68rem;border-radius:5px;background:#f0f2f5;padding:4px 7px;max-width:52%}.readystatus.ready-on{background:#fce5eb;color:#a31c34;font-weight:750}.channel-strip{display:flex;gap:12px;font-size:.65rem;color:var(--muted);margin-top:10px}.channel-strip b{font-weight:600}.panel{margin-top:18px}.controlgrid{display:grid;grid-template-columns:1.1fr 1fr;gap:24px}.controlgrid h2{margin-bottom:13px}.buttonrow{display:flex;flex-wrap:wrap;gap:8px}.control{background:#fff;border:1px solid #cdd1d9;color:#2a2e36;border-radius:9px;padding:10px 12px;min-height:42px;cursor:pointer;font-weight:650;font-size:.75rem}.control.selected{background:#26282d;color:#fff;border-color:#26282d}.control.primary{background:var(--red);color:#fff;border-color:var(--red)}.control.stop{color:#9d1d32;border-color:#e3b7c0}.control.stop.selected{background:#a51c32;color:#fff;border-color:#a51c32}.control:active{transform:scale(.98)}.control:disabled{opacity:.45;cursor:not-allowed;transform:none}.control.light-green{border-bottom:3px solid #198754}.control.light-yellow{border-bottom:3px solid #d0a21c}.control.light-red{border-bottom:3px solid #ba1931}.help{font-size:.72rem;color:var(--muted);line-height:1.65;margin:10px 0 0}.sectiontitle{margin:25px 0 13px;font-size:.84rem}.message{font-size:.75rem;min-height:1.5em;margin-top:12px;color:#9d1d32;overflow-wrap:anywhere}.settings{margin-top:14px;padding:0;overflow:hidden}.settings summary{list-style:none;cursor:pointer;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px;font-weight:700;font-size:.85rem}.settings summary::-webkit-details-marker{display:none}.settings summary::after{content:'+';color:var(--muted);font-size:1.2rem;font-weight:450}.settings[open] summary::after{content:'−'}.settings[open] summary{border-bottom:1px solid var(--line)}.settingbody{padding:21px 22px}.configgrid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.field{display:flex;flex-direction:column;gap:7px;font-weight:600;font-size:.76rem;margin-bottom:14px}.field input{font:inherit;border:1px solid #cdd1d9;padding:11px 12px;border-radius:8px;min-width:0;width:100%;background:#fff;color:#20242a}.field input:focus{outline:2px solid #ba19313d;outline-offset:1px}.savedstatus{background:#f6f7f9;border:1px solid #e5e7ec;border-radius:11px;padding:15px 17px}.networklist{display:grid;gap:6px;max-height:220px;overflow:auto;margin:12px 0}.networklist button{display:flex;justify-content:space-between;text-align:left;gap:10px}.networklist span{overflow-wrap:anywhere}.networklist small{white-space:nowrap}.twocol{display:grid;grid-template-columns:1fr 1fr;gap:12px}.purgechannel{border:1px solid var(--line);border-radius:12px;padding:17px}.purgechannel h3{font-size:.85rem;margin:0}.purgechannel .cardhead{margin-bottom:15px}.purge-state{font-size:.76rem;font-weight:700}.purge-time{font-size:.72rem;color:var(--muted);margin:5px 0 14px}.statusline{display:flex;justify-content:space-between;gap:15px;font-size:.71rem;color:var(--muted);padding-top:8px}.statusline b{color:#353b45;font-weight:650}.limits{margin-top:14px;border-top:1px solid var(--line);padding-top:12px;font-size:.68rem;color:var(--muted)}@media(max-width:760px){.dashboard,.controlgrid,.configgrid{grid-template-columns:1fr}.controlgrid{gap:20px}.settingbody{padding:18px}.settings summary{padding:17px 18px}.digestor-card{padding:18px}.digestor-body{gap:14px}.channel-strip{flex-wrap:wrap}}@media(prefers-reduced-motion:reduce){.control:active{transform:none}}
</style>

<style>
#cgdgate{margin-top:14px} #cgdgate .settingbody{padding:21px 22px} #cgdgate .purgechannel{background:#fff}
#cgdgate h2{margin:0 0 6px;font-size:1.35rem}
#cgdgate .cg-muted{color:#506069;font-size:.92rem}
#cgdgate .cg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:16px}
#cgdgate .cg-item{border:1px solid #dbe1e5;border-radius:12px;padding:14px;background:#f9fbfb}
#cgdgate .purgechannel h3{margin:0 0 10px} .purgechannel [data-purge-arm],.purgechannel [data-purge-real],.purgechannel [data-purge-cad]{display:none}
#cgdgate .cg-window{height:52px;border:3px solid #61717a;border-radius:12px;background:repeating-linear-gradient(0deg,#eef2f3 0px,#eef2f3 14px,#dbe2e4 14px,#dbe2e4 16px);position:relative;overflow:hidden}
#cgdgate .cg-slide{position:absolute;inset:0;background:linear-gradient(120deg,#79909b,#b6c8cf);border-bottom:5px solid #44616d;transform:translateY(0);transition:transform .65s ease}
#cgdgate .cg-window[data-virtual="aberta"] .cg-slide{transform:translateY(-115%)}
#cgdgate .cg-window[data-virtual="aberta"]{background:#b7e3d4}
#cgdgate .cg-status{font-size:.9rem;font-weight:700;margin:10px 0}
#cgdgate .cg-buttons{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
#cgdgate button{border:1px solid #bdced0;background:white;color:#16343a;padding:10px 12px;border-radius:8px;cursor:pointer;font-weight:600}
#cgdgate .cg-buttons button{flex:1}
#cgdgate button:disabled{opacity:.48;cursor:not-allowed}
#cgdgate .cg-live{border-top:1px solid #e0e5e7;margin-top:16px;padding-top:14px}
#cgdgate .cg-state{font-variant-numeric:tabular-nums}
#cgdgate .cg-label{color:#4d5e65}
#cgdgate .cg-ok{color:#206447}
#cgdgate .cg-alert{color:#973c25}
@media(prefers-reduced-motion:reduce){#cgdgate .cg-slide,#cgdgate .cg-rod{transition:none}}
#cgdgate .cg-actors{margin:18px 0;padding:16px;background:#f5f8f7;border:1px solid #d0dfd9;border-radius:12px}
#cgdgate .cg-led,.purgechannel .cg-led,#cg-motor-led{display:inline-block;width:14px;height:14px;border-radius:50%;background:#9aa6a5;box-shadow:inset 0 1px 2px #61716e;vertical-align:middle}
#cgdgate .cg-led[data-on="true"],.purgechannel .cg-led[data-on="true"],#cg-motor-led[data-on="true"]{background:#21ad69;box-shadow:0 0 9px rgba(33,173,105,.8)}
#cgdgate .cg-pusher{height:24px;position:relative;margin:10px 0 12px;border:1px solid #9eaeb1;border-radius:7px;background:linear-gradient(90deg,#e6ecef 65%,#bed9ca 65%)}
#cgdgate .cg-rod{position:absolute;top:5px;left:8px;height:12px;width:35%;border-radius:7px;background:linear-gradient(90deg,#9caeb5,#476875);transition:width .35s ease}
#cgdgate .cg-pusher[data-open="true"] .cg-rod{width:85%}

</style>
</head>
<body>
<header><div class="wrap brandbar"><div class="brand"><div class="monogram" aria-hidden="true">2A</div><div><strong>2A Automação Industrial</strong><div class="byline">Ângelo Gomes da Silva — Fundador</div></div></div><div class="local"><b>Campo do Gado</b>IHM local · ESP32 individual por digestor</div></div></header>
<main class="wrap">
<div class="topline"><div><div class="eyebrow">Painel de automação</div><h1>Supervisão dos digestores</h1><p class="sub">Temperatura, sinaleiros e testes de bancada.</p></div><div><button class="refresh" id="refresh" type="button">Atualizar painel</button><div id="connection" class="connection offline" role="status"><span class="dot" aria-hidden="true"></span><span id="connectionText">Aguardando conexão</span></div></div></div>
<section class="dashboard" aria-label="Digestores">
<article class="card digestor-card unlinked" id="card1" aria-label="Digestor 1"><div class="digestor-top"><div class="digestor-title"><span class="number">01</span><h2>Digestor 1</h2></div><span class="badge" id="d1mode">NÃO VINCULADO</span></div><div class="digestor-body"><div class="digestor-visual" aria-hidden="true"><svg viewBox="0 0 220 125"><path d="M10 108H210M47 89V107M175 89V107" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="28" y="30" width="165" height="62" rx="29" fill="#e2e5ea" stroke="currentColor" stroke-width="2"/><ellipse cx="31" cy="61" rx="14" ry="30" fill="#f3f4f7" stroke="currentColor" stroke-width="2"/><path d="M109 30V13H153" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="169" cy="44" r="7" fill="#f5f6f8" stroke="currentColor" stroke-width="2"/><text x="118" y="70" fill="#747c89" text-anchor="middle" font-size="21" font-weight="750">D1</text></svg></div><div><div class="digestor-temp"><span id="d1temp">—</span><span class="digestor-unit"> °C</span></div><div class="digestor-desc" id="d1range">Outro ESP32 · sem leitura vinculada</div><div class="digestor-desc" id="d1sensor">Sem telemetria vinculada</div></div></div><div class="digestor-bottom"><div class="smalltower" role="img" id="d1tower" aria-label="Sem estado vinculado"><span class="lamp red" id="d1red"></span><span class="lamp yellow" id="d1yellow"></span><span class="lamp green" id="d1green"></span><span class="signaltext" id="d1signal">Sem sinal</span></div><div class="readystatus" id="d1ready">Pronto não informado</div></div><div class="channel-strip"><span>Purgador 1: <b id="d1p1">não vinculado</b></span><span>Purgador 2: <b id="d1p2">não vinculado</b></span></div><div class="statusline"><span id="d1contact">Aguardando vínculo</span><b id="d1stamp">—</b></div></article>
<article class="card digestor-card unlinked" id="card2" aria-label="Digestor 2"><div class="digestor-top"><div class="digestor-title"><span class="number">02</span><h2>Digestor 2</h2></div><span class="badge" id="d2mode">NÃO VINCULADO</span></div><div class="digestor-body"><div class="digestor-visual" aria-hidden="true"><svg viewBox="0 0 220 125"><path d="M10 108H210M47 89V107M175 89V107" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="28" y="30" width="165" height="62" rx="29" fill="#e2e5ea" stroke="currentColor" stroke-width="2"/><ellipse cx="31" cy="61" rx="14" ry="30" fill="#f3f4f7" stroke="currentColor" stroke-width="2"/><path d="M109 30V13H153" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="169" cy="44" r="7" fill="#f5f6f8" stroke="currentColor" stroke-width="2"/><text x="118" y="70" fill="#747c89" text-anchor="middle" font-size="21" font-weight="750">D2</text></svg></div><div><div class="digestor-temp"><span id="d2temp">—</span><span class="digestor-unit"> °C</span></div><div class="digestor-desc" id="d2range">Outro ESP32 · sem leitura vinculada</div><div class="digestor-desc" id="d2sensor">Sem telemetria vinculada</div></div></div><div class="digestor-bottom"><div class="smalltower" role="img" id="d2tower" aria-label="Sem estado vinculado"><span class="lamp red" id="d2red"></span><span class="lamp yellow" id="d2yellow"></span><span class="lamp green" id="d2green"></span><span class="signaltext" id="d2signal">Sem sinal</span></div><div class="readystatus" id="d2ready">Pronto não informado</div></div><div class="channel-strip"><span>Purgador 1: <b id="d2p1">não vinculado</b></span><span>Purgador 2: <b id="d2p2">não vinculado</b></span></div><div class="statusline"><span id="d2contact">Aguardando vínculo</span><b id="d2stamp">—</b></div></article>
<article class="card digestor-card unlinked" id="card3" aria-label="Digestor 3"><div class="digestor-top"><div class="digestor-title"><span class="number">03</span><h2>Digestor 3</h2></div><span class="badge" id="d3mode">NÃO VINCULADO</span></div><div class="digestor-body"><div class="digestor-visual" aria-hidden="true"><svg viewBox="0 0 220 125"><path d="M10 108H210M47 89V107M175 89V107" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="28" y="30" width="165" height="62" rx="29" fill="#e2e5ea" stroke="currentColor" stroke-width="2"/><ellipse cx="31" cy="61" rx="14" ry="30" fill="#f3f4f7" stroke="currentColor" stroke-width="2"/><path d="M109 30V13H153" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="169" cy="44" r="7" fill="#f5f6f8" stroke="currentColor" stroke-width="2"/><text x="118" y="70" fill="#747c89" text-anchor="middle" font-size="21" font-weight="750">D3</text></svg></div><div><div class="digestor-temp"><span id="d3temp">—</span><span class="digestor-unit"> °C</span></div><div class="digestor-desc" id="d3range">Outro ESP32 · sem leitura vinculada</div><div class="digestor-desc" id="d3sensor">Sem telemetria vinculada</div></div></div><div class="digestor-bottom"><div class="smalltower" role="img" id="d3tower" aria-label="Sem estado vinculado"><span class="lamp red" id="d3red"></span><span class="lamp yellow" id="d3yellow"></span><span class="lamp green" id="d3green"></span><span class="signaltext" id="d3signal">Sem sinal</span></div><div class="readystatus" id="d3ready">Pronto não informado</div></div><div class="channel-strip"><span>Purgador 1: <b id="d3p1">não vinculado</b></span><span>Purgador 2: <b id="d3p2">não vinculado</b></span></div><div class="statusline"><span id="d3contact">Aguardando vínculo</span><b id="d3stamp">—</b></div></article>
<article class="card digestor-card unlinked" id="card4" aria-label="Digestor 4"><div class="digestor-top"><div class="digestor-title"><span class="number">04</span><h2>Digestor 4</h2></div><span class="badge" id="d4mode">NÃO VINCULADO</span></div><div class="digestor-body"><div class="digestor-visual" aria-hidden="true"><svg viewBox="0 0 220 125"><path d="M10 108H210M47 89V107M175 89V107" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><rect x="28" y="30" width="165" height="62" rx="29" fill="#e2e5ea" stroke="currentColor" stroke-width="2"/><ellipse cx="31" cy="61" rx="14" ry="30" fill="#f3f4f7" stroke="currentColor" stroke-width="2"/><path d="M109 30V13H153" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="169" cy="44" r="7" fill="#f5f6f8" stroke="currentColor" stroke-width="2"/><text x="118" y="70" fill="#747c89" text-anchor="middle" font-size="21" font-weight="750">D4</text></svg></div><div><div class="digestor-temp"><span id="d4temp">—</span><span class="digestor-unit"> °C</span></div><div class="digestor-desc" id="d4range">Outro ESP32 · sem leitura vinculada</div><div class="digestor-desc" id="d4sensor">Sem telemetria vinculada</div></div></div><div class="digestor-bottom"><div class="smalltower" role="img" id="d4tower" aria-label="Sem estado vinculado"><span class="lamp red" id="d4red"></span><span class="lamp yellow" id="d4yellow"></span><span class="lamp green" id="d4green"></span><span class="signaltext" id="d4signal">Sem sinal</span></div><div class="readystatus" id="d4ready">Pronto não informado</div></div><div class="channel-strip"><span>Purgador 1: <b id="d4p1">não vinculado</b></span><span>Purgador 2: <b id="d4p2">não vinculado</b></span></div><div class="statusline"><span id="d4contact">Aguardando vínculo</span><b id="d4stamp">—</b></div></article>
</section>
<section class="card panel" aria-labelledby="pcSourceTitle"><div class="cardhead"><h2 id="pcSourceTitle">Fonte da simulação</h2><span class="badge" id="pcSimStatus">AGUARDANDO ESTADO</span></div><p class="sub" id="pcHeating">Aquecimento virtual: não confirmado</p><p class="help"><span class="cg-led" id="cg-motor-led" data-on="false"></span> Motor virtual: <strong id="cg-motor-state">PARADO</strong></p><p class="help" id="pcSimHelp">Simulação CAD e bancada são independentes da produção. Selecione Simulação CAD para espelhar os LEDs da bancada. GPIO27 opcional nesta versão.</p></section>
<section class="card panel" aria-labelledby="controlTitle"><div class="cardhead"><h2 id="controlTitle">Controles deste ESP32 · <span id="selectedDigestor">Digestor 1</span></h2><span class="badge" id="outputBadge">SAÍDAS NÃO CONFIRMADAS</span></div><div class="controlgrid"><div><h2>Modo de funcionamento</h2><div class="buttonrow"><button class="control" id="modeRemote" data-mode="simulacao">Simulação CAD</button><button class="control" id="modeAuto" data-mode="automatico">Automático · LEDs</button><button class="control" id="modeManual" data-mode="manual">Manual · LEDs</button><button class="control" id="modeReal" data-mode="real" disabled>PT100 · monitoramento</button><button class="control stop" id="modeStop" data-mode="parado">Parar tudo</button></div><p class="help" id="modeHelp">R3: sete canais disponíveis. Testes locais temporizados; Simulação CAD acompanha o PC. GPIO27 opcional.</p><h2 class="sectiontitle">Sinaleiros · teste local de 5 s</h2><div class="buttonrow"><button class="control light-green" data-manual="verde" disabled>Verde</button><button class="control light-yellow" data-manual="amarelo" disabled>Amarelo</button><button class="control light-red" data-manual="vermelho" disabled>Vermelho</button><button class="control" data-manual="nenhum" disabled>Desligar</button></div></div><div><h2>Testes dos relés · 5 segundos</h2><div class="buttonrow"><button class="control light-green" data-test="inicio">Baixa · verde</button><button class="control light-yellow" data-test="meio">Intermediária · amarelo</button><button class="control light-red" data-test="alto">Alta · vermelho</button><button class="control light-red" data-test="fim">Pronto · vermelho piscando</button></div><p class="help">Os testes de bancada não representam uma medição PT100. O automático percorre as quatro faixas e encerra com os sinaleiros desligados.</p><p class="help" id="testRemaining">Nenhum teste em andamento.</p><p class="help" id="remoteInfo">Simulação CAD não selecionada.</p></div></div><p id="commandMessage" class="message" role="status"></p></section>
<details class="card settings" id="purgeSettings"><summary>Controle dos purgadores <span class="badge">DOIS CANAIS LOCAIS</span></summary><div class="settingbody"><div class="savedstatus" style="margin-bottom:14px"><strong>Relés para lâmpadas de bancada · SIMULAÇÃO CAD</strong>
 <p class="help">Teste elétrico isolado: somente LEDs/relés de baixa tensão. Sete GPIOs disponíveis sem jumper GPIO27; nenhum atuador da fábrica deve estar conectado.</p>
 <p class="help">Selecione Simulação CAD: os LEDs acompanham automaticamente o ciclo. Perda de sinal desarma; para retomar, selecione novamente Simulação CAD.</p>
 <div class="buttonrow" style="margin-top:10px"><button type="button" class="control stop" id="benchStop">Desarmar e apagar todos</button></div>
 <p class="help">Teste individual isolado · 2 segundos · todos os outros LEDs apagados. Ao terminar, permanece desarmado.</p>
 <div class="buttonrow"><button class="control light-green" data-bench-test="verde" disabled>Testar LED verde</button><button class="control light-yellow" data-bench-test="amarelo" disabled>Testar LED amarelo</button><button class="control light-red" data-bench-test="vermelho" disabled>Testar LED vermelho</button></div>
 <p class="message" id="benchMessage" role="status"></p><p class="help" id="benchStatus">Aguardando estado</p></div><p class="sub">GPIO25 e GPIO26 acompanham os purgadores virtuais. Os tempos abaixo pertencem ao temporizador virtual local; não alteram o ciclo CAD.</p><div class="configgrid" style="margin-top:17px">
<section class="purgechannel"><div class="cardhead"><h3>Purgador 1 · Camisa</h3><span class="cg-led" id="p1led" data-on="false" title="Saída do relé camisa"></span><span class="badge" id="p1mode">DESARMADO</span></div><div class="purge-state" id="p1state">Não iniciado</div><p class="purge-time" id="p1remaining">Aguardando estado do ESP32</p><div class="savedstatus" style="margin-bottom:15px"><dl class="rows"><div><dt>Válvula virtual do PC</dt><dd id="p1virtual">Não confirmada</dd></div><div><dt>Relé local</dt><dd id="p1relay">Não confirmado</dd></div></dl></div><div class="twocol"><label class="field" for="p1closed">Fechado (min)<input id="p1closed" type="number" min="1" max="120" step="1" value="5"></label><label class="field" for="p1open">Aberto (s)<input id="p1open" type="number" min="1" max="300" step="1" value="60"></label></div><div class="buttonrow"><button class="control" data-purge-save="1">Salvar tempos</button><button class="control" data-purge-arm="1" hidden disabled>Armar saída</button><button class="control" data-purge-cad="1" hidden disabled>Teste CAD: use botão acima</button><button class="control primary" data-purge-real="1" hidden disabled>Iniciar ciclo</button><button class="control" data-purge-start="1" disabled>Testar simulação</button><button class="control" data-bench-test="camisa" disabled>Testar LED · 2 s</button><button class="control stop" data-purge-stop="1">Parar e fechar</button></div><p class="help" id="p1physical">Saída física desarmada · aguardando estado do ESP32.</p><p class="message" id="p1message" role="status"></p></section>
<section class="purgechannel"><div class="cardhead"><h3>Purgador 2 · Eixo</h3><span class="cg-led" id="p2led" data-on="false" title="Saída do relé eixo"></span><span class="badge" id="p2mode">DESARMADO</span></div><div class="purge-state" id="p2state">Não iniciado</div><p class="purge-time" id="p2remaining">Aguardando estado do ESP32</p><div class="savedstatus" style="margin-bottom:15px"><dl class="rows"><div><dt>Válvula virtual do PC</dt><dd id="p2virtual">Não confirmada</dd></div><div><dt>Relé local</dt><dd id="p2relay">Não confirmado</dd></div></dl></div><div class="twocol"><label class="field" for="p2closed">Fechado (min)<input id="p2closed" type="number" min="1" max="120" step="1" value="10"></label><label class="field" for="p2open">Aberto (s)<input id="p2open" type="number" min="1" max="300" step="1" value="60"></label></div><div class="buttonrow"><button class="control" data-purge-save="2">Salvar tempos</button><button class="control" data-purge-arm="2" hidden disabled>Armar saída</button><button class="control" data-purge-cad="2" hidden disabled>Teste CAD: use botão acima</button><button class="control primary" data-purge-real="2" hidden disabled>Iniciar ciclo</button><button class="control" data-purge-start="2" disabled>Testar simulação</button><button class="control" data-bench-test="eixo" disabled>Testar LED · 2 s</button><button class="control stop" data-purge-stop="2">Parar e fechar</button></div><p class="help" id="p2physical">Saída física desarmada · aguardando estado do ESP32.</p><p class="message" id="p2message" role="status"></p></section>
</div><div class="limits">GPIO25 camisa, GPIO26 eixo (LOW ativo). Indicadores de bancada não comprovam movimento de válvulas. Tempos reais são independentes da simulação CAD.</div></div></details>
<details class="card settings" id="cgdgate">
 <summary>Guilhotinas de carga e descarga <span class="badge" id="cg-gates-summary">BANCADA DE LEDS</span></summary>
 <div class="settingbody">
 <h3 class="sectiontitle">Guilhotinas do Digestor <span id="cg-digestor">1</span> · estados simulados</h3>
 <p class="sub">Estados ABERTA/FECHADA e tempo recebidos do CAD. Somente LEDs: não há retorno de fim de curso.</p>
 <div class="cg-grid">
  <article class="purgechannel">
   <h3>Guilhotina de carregamento</h3>
   <div id="cg-visual-carga" class="cg-window" data-virtual="fechada" role="img" aria-label="Guilhotina de carga fechada apenas na simulacao"><div class="cg-slide"></div></div>
   <div id="cg-virtual-carga" class="purge-state">FECHADA · SIMULADA</div><p class="purge-time">Tempo no estado: <b id="cg-time-carga">0 s</b> · <span class="cg-led" id="cg-led-carga" data-on="false"></span> LED abertura</p>
   
   <p class="purge-time">GPIO32 · alimentação: relé energizado = abertura; desligado = contato NC.</p>
   <div class="buttonrow"><button class="control" data-bench-test="carga_aberta" disabled>Testar aberta · 2 s</button><button class="control stop" data-bench-stop>Fechar e parar bancada</button></div>
   
  </article>
  <article class="purgechannel">
   <h3>Guilhotina de descarga</h3>
   <div id="cg-visual-descarga" class="cg-window" data-virtual="fechada" role="img" aria-label="Guilhotina de descarga fechada apenas na simulacao"><div class="cg-slide"></div></div>
   <div id="cg-virtual-descarga" class="purge-state">FECHADA · SIMULADA</div><p class="purge-time">Tempo no estado: <b id="cg-time-descarga">0 s</b> · <span class="cg-led" id="cg-led-descarga" data-on="false"></span> LED abertura</p>
   
   <p class="purge-time">GPIO33 · descarga: relé energizado = abertura; desligado = contato NC.</p>
   <div class="buttonrow"><button class="control" data-bench-test="descarga_aberta" disabled>Testar aberta · 2 s</button><button class="control stop" data-bench-stop>Fechar e parar bancada</button></div>
   
  </article>
 </div>

 <div class="cg-live" aria-live="polite">
  <strong>Diagnóstico das saídas de luzes:</strong>
  <p id="cg-io-status" class="cg-state cg-alert">Saídas de bancada desarmadas. Aguardando autorização local.</p>
  <p class="cg-muted">Firmware: <span id="cg-fw">Aguardando</span> | Modo: <span id="cg-mode">Sem leitura</span> | Chave GPIO27: <span id="cg-key">Nao confirmada</span> | Ultimo comando: <span id="cg-last">Nenhum</span></p>
  <p id="cg-feedback" class="cg-muted">Relés desta versão representam somente LEDs de teste. Não há retorno físico das comportas.</p>
  <p class="help">Pinagem r3: somente GPIO32 (alimentação) e GPIO33 (descarga). GPIO16/17 livres desta função. Fechar e parar desenergiza toda a bancada; sem confirmação de posição física.</p>
 </div>
</div></details>
<details class="card settings" id="wifiSettings"><summary>Configuração de Wi-Fi <span class="badge" id="wifiSummary">CONSULTANDO</span></summary><div class="settingbody configgrid"><div><label class="field" for="ssid">Rede Wi-Fi de 2,4 GHz (SSID)<input id="ssid" maxlength="32" autocomplete="off" placeholder="Selecione uma rede ou digite" list="networkOptions"><datalist id="networkOptions"></datalist></label><label class="field" for="wifiPassword">Senha da rede<input id="wifiPassword" type="password" maxlength="63" autocomplete="new-password" placeholder="Senha nunca é exibida novamente"></label><div class="buttonrow"><button class="control" id="scanWifi">Procurar redes</button><button class="control primary" id="connectWifi">Conectar e salvar</button></div><p class="help" id="networkInfo">A rede é salva no ESP32 somente após a conexão ser confirmada.</p><div class="networklist" id="networkList" aria-label="Redes Wi-Fi encontradas"></div></div><div><div class="savedstatus"><dl class="rows"><div><dt>Conexão</dt><dd id="wifiStatus">—</dd></div><div><dt>Rede</dt><dd id="wifiSsid">—</dd></div><div><dt>Endereço local</dt><dd id="wifiIp">—</dd></div><div><dt>Acesso direto</dt><dd>192.168.4.1</dd></div></dl></div><p class="help">O ponto de acesso próprio do ESP32 permanece disponível durante a configuração. Esta página usa HTTP local: configure senhas e token apenas na rede controlada de bancada.</p><div class="buttonrow" style="margin-top:15px"><button class="control stop" id="deleteWifi">Esquecer rede salva</button></div><p class="message" id="wifiMessage" role="status"></p></div></div></details>
<details class="card settings" id="cadSettings"><summary>Integração com o CAD <span class="badge" id="cadSummary">CONSULTANDO</span></summary><div class="settingbody configgrid"><div><label class="field" for="cadToken">Token exclusivo deste ESP32<input id="cadToken" type="password" maxlength="200" autocomplete="off" placeholder="cgd_..."></label><div class="buttonrow"><button class="control primary" id="saveToken">Salvar token</button><button class="control stop" id="deleteToken">Apagar token</button><button class="control" id="authorizeRemote">Autorizar CAD</button></div><p class="help">Gere a credencial em Automação → Configuração no CAD. Pare os testes antes de trocar o token. A credencial salva não é devolvida para a página.</p><p class="message" id="cadMessage" role="status"></p></div><div><div class="savedstatus"><dl class="rows"><div><dt>Dispositivo</dt><dd id="cadDevice">—</dd></div><div><dt>Credencial</dt><dd id="cadConfigured">—</dd></div><div><dt>Comunicação</dt><dd id="cadStatus">—</dd></div><div><dt>HTTP</dt><dd id="cadHttp">—</dd></div><div><dt>Servidor</dt><dd>manutencao.campodogado.app.br</dd></div></dl></div><p class="help">Em operação real, o ESP32 decide a cor e envia a telemetria por HTTPS. A simulação CAD recebe apenas sinais de bancada; ordens industriais não fazem parte desta integração.</p></div></div></details>
<aside class="safety"><div class="safetyicon" aria-hidden="true">!</div><div><strong>Comandos locais · confira o estado de cada canal</strong><p>Esta versão aciona somente relés com LEDs de bancada. Mantenha solenóides, cilindros, vapor e máquinas desconectados. Desarmar apaga todos os LEDs e bloqueia a retomada automática. A tela informa comandos, sem retorno elétrico ou mecânico. “Pronto” indica somente a faixa de temperatura.</p></div></aside>


</main><footer class="wrap footer"><span>2A Automação Industrial · <span id="firmware">ESP32</span></span><span>4 digestores no painel · 1 ESP32 vinculado · atualização local a cada 1 segundo</span></footer>
<script>
(function(){
'use strict';
const el=id=>document.getElementById(id);
const text=(id,value)=>{el(id).textContent=value==null||value===''?'—':String(value);};
const each=(selector,fn)=>document.querySelectorAll(selector).forEach(fn);
const sensorNames={SEM_SENSOR:'Sem sensor',SEM_SINAL:'Sem sinal',VALIDO:'Válido',FALHA:'Falha',SIMULADO:'SIMULADO · PC',AGUARDANDO_SIMULACAO:'Aguardando simulação do PC',SIMULACAO_EXPIRADA:'Simulação CAD expirada'};
const rangeNames={BAIXA:'Baixa · 0 a 50 °C',INTERMEDIARIA:'Intermediária · acima de 50 e abaixo de 100 °C',ALTA:'Alta · 100 a 120 °C',PRONTO:'Pronto · acima de 120 °C',SENSOR_INDISPONIVEL:'Sensor indisponível'};
const colorNames={VERDE:'Verde fixo',AMARELO:'Amarelo fixo',VERMELHO:'Vermelho fixo',VERMELHO_PISCANDO:'Vermelho piscando',DESLIGADO:'Desligado'};
const modes={simulacao:'SIMULAÇÃO CAD',automatico:'TESTE AUTOMÁTICO',manual:'MANUAL',teste:'TESTE RÁPIDO',real:'OPERAÇÃO REAL',parado:'SINALEIROS PARADOS'};
const cadNames=['Token não configurado','Wi-Fi desconectado','Aguardando horário NTP','Conectando à API','Conectado ao CAD','Credencial rejeitada / bloqueada','Falha HTTPS / API'];
let state=null,polling=false,lastContact=0,mutating=false,cadPolling=false;
async function request(url,options={},timeout=4500){
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeout);
 try{const response=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,signal:ctrl.signal});const body=await response.text();return{ok:response.ok,status:response.status,json:async()=>JSON.parse(body),text:async()=>body};}finally{clearTimeout(timer);}
}
async function post(url,params,messageId='commandMessage'){
 if(mutating)return false;mutating=true;text(messageId,'');
 try{const response=await request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-CGD-Local':'true'},body:new URLSearchParams(params)});if(!response.ok)throw Error((await response.text()).slice(0,240)||'Não foi possível aplicar: HTTP '+response.status);await poll();return true;}
 catch(error){text(messageId,error.name==='AbortError'?'ESP32 não respondeu. Atualize o painel antes de repetir.':error.message);return false;}
 finally{mutating=false;}
}
function clearLive(){
 state=null;window.cgdGatePanelUpdate?.(null);el('connection').className='connection offline';text('connectionText','Sem comunicação local');text('outputBadge','SAÍDAS NÃO CONFIRMADAS');
 for(let id=1;id<=4;id++){if(!el('card'+id).classList.contains('linked'))continue;text('d'+id+'temp','—');text('d'+id+'range','Estado atual não confirmado');text('d'+id+'sensor','Origem dos dados: sem contato');text('d'+id+'mode','SEM COMUNICAÇÃO');text('d'+id+'signal','Sem leitura');text('d'+id+'ready','Pronto não confirmado');el('d'+id+'ready').className='readystatus';text('d'+id+'contact','Sem contato local');text('d'+id+'stamp','—');['red','yellow','green'].forEach(color=>el('d'+id+color).className='lamp '+color);[1,2].forEach(ch=>text('d'+id+'p'+ch,'sem contato'));}
 each('[data-manual],[data-purge-start],[data-purge-arm],[data-purge-real],[data-purge-cad]',button=>button.disabled=true);el('modeReal').disabled=true;
 text('pcSimStatus','SEM CONTATO');text('pcHeating','Aquecimento virtual: não confirmado');text('pcSimHelp','Sem contato com o ESP32. Os estados da simulação e dos relés não estão confirmados.');
 for(let ch=1;ch<=2;ch++){text('p'+ch+'virtual','Não confirmado');text('p'+ch+'relay','Não confirmado');text('p'+ch+'mode','SEM CONTATO');text('p'+ch+'state','Estado não confirmado');text('p'+ch+'remaining','Sem contato com o ESP32');}
}
function renderPurge(items,id,real,realEligible,simulation){
 for(let ch=1;ch<=2;ch++){
  const item=Array.isArray(items)?items.find(row=>row.canal===ch):null;
  const available=simulation.current&&simulation.complete;
  const virtual=available&&simulation.valves?simulation.valves[ch===1?'camisa':'eixo']:null;
  text('p'+ch+'virtual',real?'Não utilizado no modo real':virtual==='ABERTO'?'Aberto · simulado':virtual==='FECHADO'?'Fechado · simulado':'Não informado');
  if(!item){text('p'+ch+'mode','NÃO INFORMADO');text('p'+ch+'state','Não informado');text('p'+ch+'relay','Não confirmado');text('d'+id+'p'+ch,'não informado');['start','arm','real','cad'].forEach(action=>{document.querySelector('[data-purge-'+action+'="'+ch+'"]').disabled=true;});continue;}
  const armed=item.armado===true||item.armado_real===true;
  const cadArmed=item.armado_teste_cad===true;
  const cadTest=item.modo==='TESTE_CAD'||cadArmed;
  const simulated=item.modo==='SIMULACAO';
  const physical=item.saida_fisica_habilitada===true;
  const commandKnown=typeof item.comando_aberto==='boolean';
  const opened=item.comando_aberto===true;
  const relayLabel=!commandKnown||(cadTest&&!available)?'Não confirmado':opened?'Abrir · comandado':'Fechar · comandado';
  const label=cadTest?(available?(opened?'Teste CAD · aberto comandado':'Teste CAD · fechado comandado'):'Teste CAD sem simulação atual'):(simulated?(item.aberto===true?'Aberto · simulado':'Fechado · simulado'):(armed?(item.ativo===true?(opened?'Aberto · comandado':'Fechado · comandado'):'Armado · fechado comandado'):'Desarmado · fechado comandado'));
  const mirrored=available&&!real;
  const visualLabel=virtual==='ABERTO'?'ABERTO · CAD (SIMULADO)':virtual==='FECHADO'?'FECHADO · CAD (SIMULADO)':'SEM ESTADO VIRTUAL';
  text('p'+ch+'mode',item.modo==='TESTE_LED'?'TESTE LED · 2 s':mirrored?'SIMULAÇÃO CAD':cadTest?'TESTE CAD ARMADO':simulated?'SIMULAÇÃO LOCAL':armed?'SAÍDA ARMADA':'DESARMADO');
  text('p'+ch+'relay',relayLabel);text('p'+ch+'state',item.modo==='TESTE_LED'?(opened?'LED LIGADO · TESTE':'LED DESLIGADO'):mirrored?visualLabel:label);text('d'+id+'p'+ch,mirrored?visualLabel:label);
  text('p'+ch+'remaining',cadTest?'Segue a válvula virtual do PC enquanto a simulação atual for renovada.':item.ativo===true&&Number.isFinite(item.restante_ms)?'Próxima transição em '+Math.ceil(Math.max(0,item.restante_ms)/1000)+' s':armed?'Saída armada. Inicie o ciclo para usar os tempos configurados.':'Temporizador virtual parado. O espelhamento usa os tempos do CAD.');
  [['closed','fechado_min'],['open','aberto_s']].forEach(([suffix,key])=>{const field=el('p'+ch+suffix);if(field.dataset.dirty!=='true'&&Number.isFinite(item[key]))field.value=String(item[key]);});
  text('p'+ch+'physical',physical?'GPIO '+String(item.pino_reservado||'—')+' · relé LOW · estado comandado, sem feedback físico':'Saída física indisponível neste firmware');
  document.querySelector('[data-purge-arm="'+ch+'"]').disabled=true;
  document.querySelector('[data-purge-real="'+ch+'"]').disabled=true;
  document.querySelector('[data-purge-cad="'+ch+'"]').disabled=true; // Arme conjunto via bancada LED
  document.querySelector('[data-purge-start="'+ch+'"]').disabled=real||simulation.current||armed||cadArmed||item.ativo===true;
  document.querySelector('[data-purge-save="'+ch+'"]').disabled=item.ativo===true||cadArmed;
 }
}
function render(data){
 if(!data||typeof data!=='object'||!Number.isInteger(data.digestor)||data.digestor<1||data.digestor>4)throw Error('Estado inválido');
 state=data;window.cgdGatePanelUpdate?.(data);const id=data.digestor;const prefix='d'+id;const real=data.origem==='REAL'||data.modo==='real';const remote=data.modo==='simulacao'&&!real;const sensorValid=data.sensor_status==='VALIDO';
 const numeric=typeof data.temperatura_c==='number'&&Number.isFinite(data.temperatura_c);
 const simCurrent=remote&&data.origem==='SIMULACAO'&&data.sensor_status==='SIMULADO'&&data.simulacao_cad_atual===true&&numeric;
 const readable=numeric&&(real?sensorValid:remote?simCurrent:data.sensor_status==='SIMULADO');
 const completeSimulation=simCurrent&&data.estado_simulacao_disponivel===true;
 const validSource=real?sensorValid&&readable:remote?simCurrent:true;
 const expired=remote&&data.sensor_status==='SIMULACAO_EXPIRADA';
 const localPreview=false; // Mostrar o comando eletrico real, inclusive testes locais.
 const color=validSource?(localPreview?data.cor_sinaleiro_virtual:data.cor_sinaleiro):'DESLIGADO';
 const testColor=data.bancada_reles?.teste_individual?['Vermelho','Amarelo','Verde'][data.bancada_reles.teste_canal]:null;
 const signalLabel=testColor?'Teste isolado · '+testColor:(colorNames[color]||'Não informado')+(data.bancada_reles?.teste_local?' · LEDs':'');
 const ready=data.pronto_descarga===true&&color==='VERMELHO_PISCANDO'&&validSource&&readable;
 el('card'+id).className='card digestor-card linked';text('selectedDigestor','Digestor '+id);text(prefix+'mode',modes[data.modo]||'MODO NÃO INFORMADO');
 text(prefix+'temp',readable?data.temperatura_c.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}):'—');
 const sourceLabel=real?'PT100: '+(sensorNames[data.sensor_status]||'Não informado'):remote?(simCurrent?'SIMULADO · PC':expired?'Simulação CAD expirada':'Aguardando simulação do PC'):'Sensor: '+(sensorNames[data.sensor_status]||'Não informado');
 text(prefix+'range',real&&!validSource?'Sensor indisponível':remote&&!simCurrent?(expired?'Simulação expirada · sem temperatura atual':'Aguardando temperatura simulada do PC'):(rangeNames[data.faixa_temperatura]||'Faixa não informada'));text(prefix+'sensor',sourceLabel);
 text(prefix+'signal',signalLabel);text(prefix+'ready',ready?(real?'Pronto para descarga':'Pronto · simulado'):remote&&!simCurrent?'Pronto: não confirmado':'Pronto: não');el(prefix+'ready').className='readystatus'+(ready?' ready-on':'');
 ['red','yellow','green'].forEach((name,index)=>{const values=localPreview?[data.vermelho_virtual,data.amarelo_virtual,data.verde_virtual]:[data.vermelho,data.amarelo,data.verde];const commanded=values[index]===true&&validSource;el(prefix+name).className='lamp '+name+(commanded?' active':'');});
 el(prefix+'tower').setAttribute('aria-label',signalLabel);
 text(prefix+'contact','Este ESP32 · contato agora');
 const measured=typeof data.timestamp_medicao==='string'?new Date(data.timestamp_medicao):null;
 text(prefix+'stamp',measured&&Number.isFinite(measured.getTime())&&validSource?(real?'Medição ':'Simulação ')+measured.toLocaleTimeString('pt-BR'):(real?'Horário pendente':simCurrent?'Temperatura simulada atual':'Sem medição real'));
 text('pcSimStatus',real?'PT100 REAL':remote?(simCurrent?'SIMULAÇÃO PC ATUAL':expired?'SIMULAÇÃO EXPIRADA':'AGUARDANDO SIMULAÇÃO'):'TESTE LOCAL');
 text('pcHeating',real?'Aquecimento virtual: não utilizado no modo real':completeSimulation&&typeof data.aquecimento_simulado==='boolean'?'Aquecimento virtual: '+(data.aquecimento_simulado?'ligado':'desligado')+' · simulado':'Aquecimento virtual: não confirmado');
 text('pcSimHelp',real?'As informações simuladas do PC não alteram o PT100 nem os ciclos locais neste modo.':completeSimulation?'O CAD controla a animação. Os LEDs acompanham os comandos atuais do CAD. A chave GPIO27 é opcional nesta revisão.':simCurrent?'Temperatura simulada atual. Estados de aquecimento e válvulas indisponíveis; o teste dos relés pelo CAD permanece bloqueado.':remote?'Aguardando uma simulação atual do PC. Sem renovação válida, o teste CAD fecha e desarma os canais.':'Selecione Simulação CAD para acompanhar temperatura, aquecimento e válvulas virtuais do PC.');
 el('connection').className='connection online';text('connectionText','ESP32 conectado · D'+id);
 text('outputBadge',data.bancada_reles?.armada||data.bancada_reles?.teste_local||data.bancada_reles?.teste_individual?'LEDS DA BANCADA ATIVOS':'7 GPIOs DISPONÍVEIS · DESLIGADOS');
 each('[data-mode]',button=>button.classList.toggle('selected',button.dataset.mode===data.modo));
 each('[data-manual]',button=>button.disabled=data.modo!=='manual');el('modeReal').disabled=data.pt100_habilitado!==true;
 text('modeHelp','R3: testes locais acionam os relés dos LEDs. Manual e testes rápidos expiram em 5 s; automático encerra após quatro fases. Simulação CAD exige comunicação atual.');
 text('testRemaining',['teste','automatico'].includes(data.modo)&&Number.isFinite(data.restante_ms)?'Etapa atual: '+(Math.max(0,data.restante_ms)/1000).toFixed(1)+' s restantes.':'Nenhum teste rápido em andamento.');
 text('remoteInfo',remote?(completeSimulation?'Simulação CAD ativa: luzes e relés de LEDs acompanham o CAD após autorização LOCAL da bancada.':simCurrent?'Temperatura simulada atual. Aguardando dados visuais de purgadores e guilhotinas do CAD.':expired?'Simulação CAD expirada. Sinaleiros apagados e teste CAD desarmado.':'Simulação CAD selecionada. Aguardando temperatura e estados virtuais atuais do PC.'):'Simulação CAD não selecionada.');
 text('wifiStatus',data.wifi_tentando?'Conectando...':(data.wifi_conectado?'Conectado':'Não conectado'));text('wifiSummary',data.wifi_tentando?'CONECTANDO':(data.wifi_conectado?'CONECTADO':'SEM REDE'));
 text('wifiIp',data.wifi_conectado?data.wifi_ip:'Use 192.168.4.1');text('wifiSsid',data.wifi_ssid||'Não configurada');text('wifiMessage',data.wifi_mensagem||'');el('connectWifi').disabled=data.wifi_tentando===true;
 text('firmware',data.firmware||'ESP32 · IHM local');renderPurge(data.purgadores,id,real,data.modo==='parado'||(data.modo==='real'&&sensorValid&&readable),{current:simCurrent,complete:completeSimulation,valves:data.purgadores_visuais||data.purgadores_simulados});lastContact=Date.now();
}
async function poll(){if(polling)return;polling=true;try{const response=await request('/api/estado',{},1800);if(!response.ok)throw Error('Sem contato');render(await response.json());}catch(_){clearLive();}finally{polling=false;}}
async function pollCad(){if(cadPolling)return;cadPolling=true;try{const response=await request('/api/cad/status');if(!response.ok)throw Error('Sem contato');const data=await response.json();text('cadDevice',data.device_id);text('cadConfigured',data.credencial_configurada?'Salva no ESP32':'Não configurada');text('cadStatus',cadNames[data.status]||'Não informado');text('cadHttp',data.http===0?'—':data.http);text('cadSummary',data.status===4?'CONECTADO':data.credencial_configurada?'CONFIGURADO':'SEM TOKEN');}catch(_){text('cadStatus','Sem comunicação local');text('cadSummary','SEM CONTATO');}finally{cadPolling=false;}}
async function scanWifi(attempt=0){
 const button=el('scanWifi');button.disabled=true;text('networkInfo','Procurando redes de 2,4 GHz...');
 try{const response=await request('/api/wifi/scan');if(response.status===202){if(attempt>=12)throw Error('Busca em andamento; tente novamente em alguns instantes.');setTimeout(()=>scanWifi(attempt+1),1300);return;}if(!response.ok)throw Error('Não foi possível procurar redes.');const data=await response.json();const list=el('networkList'),options=el('networkOptions');list.replaceChildren();options.replaceChildren();const networks=new Map();(data.redes||[]).forEach(row=>{if(typeof row.ssid==='string'&&row.ssid&&!networks.has(row.ssid))networks.set(row.ssid,row);});[...networks.values()].sort((a,b)=>b.rssi-a.rssi).forEach(row=>{const option=document.createElement('option');option.value=row.ssid;options.appendChild(option);const select=document.createElement('button');select.type='button';select.className='control';const name=document.createElement('span');name.textContent=row.ssid;const info=document.createElement('small');info.textContent=(row.protegida?'Protegida · ':'Aberta · ')+row.rssi+' dBm';select.append(name,info);select.addEventListener('click',()=>{el('ssid').value=row.ssid;el('wifiPassword').focus();text('networkInfo','Rede selecionada. Informe a senha e conecte.');});list.appendChild(select);});text('networkInfo',networks.size+' rede(s) encontrada(s). Você também pode digitar o SSID.');button.disabled=false;}
 catch(error){text('networkInfo',error.message);button.disabled=false;}
}
async function connectWifi(){const ssid=el('ssid').value.trim(),password=el('wifiPassword').value;if(!ssid||ssid.length>32){text('wifiMessage','Informe uma rede com até 32 caracteres.');return;}if(password.length>63||(password.length>0&&password.length<8)){text('wifiMessage','Senha WPA2: 8 a 63 caracteres, ou deixe vazio para rede aberta.');return;}try{if(await post('/api/wifi/conectar',{ssid,senha:password},'wifiMessage'))text('wifiMessage','Conectando. A rede será salva após confirmação; aguarde até 25 segundos.');}finally{el('wifiPassword').value='';}}
async function saveToken(){const token=el('cadToken').value.trim();if(!token.startsWith('cgd_')||token.length<30||token.length>200){text('cadMessage','Informe o token válido gerado no CAD.');return;}try{if(await post('/api/cad/token',{token},'cadMessage')){text('cadMessage','Token salvo no ESP32. A credencial não será exibida novamente.');await pollCad();}}finally{el('cadToken').value='';}}
async function purge(channel,action){const params={canal:String(channel),valor:action};if(action==='configurar'){const closed=Number(el('p'+channel+'closed').value),open=Number(el('p'+channel+'open').value);if(!Number.isInteger(closed)||closed<1||closed>120||!Number.isInteger(open)||open<1||open>300){text('p'+channel+'message','Use minutos de 1 a 120 e segundos de 1 a 300.');return;}params.fechado_min=String(closed);params.aberto_s=String(open);}if(await post('/api/purgadores',params,'p'+channel+'message')){text('p'+channel+'message',action==='configurar'?'Tempos salvos.':action==='iniciar'?'Simulação iniciada; a saída física deste canal permanece fechada.':action==='armar_real'?'Saída armada. O ciclo ainda não foi iniciado.':action==='armar_teste_cad'?'Teste CAD armado localmente. O relé acompanha a válvula virtual enquanto a simulação for atual.':action==='iniciar_real'?'Ciclo físico iniciado. A tela indica comandos, sem feedback da válvula.':'Canal parado, fechado e desarmado.');if(action==='configurar'){el('p'+channel+'closed').dataset.dirty='false';el('p'+channel+'open').dataset.dirty='false';}}}
 each('[data-mode]',button=>button.addEventListener('click',()=>post('/api/modo',{valor:button.dataset.mode})));
 each('[data-manual]',button=>button.addEventListener('click',()=>post('/api/manual',{valor:button.dataset.manual})));
 each('[data-test]',button=>button.addEventListener('click',()=>post('/api/simular',{valor:button.dataset.test})));
 each('[data-purge-save]',button=>button.addEventListener('click',()=>purge(Number(button.dataset.purgeSave),'configurar')));
 each('[data-purge-start]',button=>button.addEventListener('click',()=>purge(Number(button.dataset.purgeStart),'iniciar')));
 each('[data-purge-arm]',button=>button.addEventListener('click',()=>purge(Number(button.dataset.purgeArm),'armar_real')));
 each('[data-purge-cad]',button=>button.addEventListener('click',()=>purge(Number(button.dataset.purgeCad),'armar_teste_cad')));
 each('[data-purge-real]',button=>button.addEventListener('click',()=>purge(Number(button.dataset.purgeReal),'iniciar_real')));
 each('[data-purge-stop]',button=>button.addEventListener('click',()=>purge(Number(button.dataset.purgeStop),'parar')));
 for(let ch=1;ch<=2;ch++)['closed','open'].forEach(name=>el('p'+ch+name).addEventListener('input',()=>{el('p'+ch+name).dataset.dirty='true';}));
 el('refresh').addEventListener('click',()=>{poll();pollCad();});el('scanWifi').addEventListener('click',()=>scanWifi());el('connectWifi').addEventListener('click',connectWifi);el('saveToken').addEventListener('click',saveToken);
 el('deleteWifi').addEventListener('click',async()=>{if(!confirm('Esquecer a rede salva? O acesso direto 192.168.4.1 permanece disponível.'))return;if(await post('/api/wifi/apagar',{},'wifiMessage'))text('wifiMessage','Rede salva removida. Use o acesso direto do ESP32.');el('wifiPassword').value='';});
 el('deleteToken').addEventListener('click',async()=>{if(!confirm('Apagar a credencial de integração salva neste ESP32?'))return;if(await post('/api/cad/apagar',{},'cadMessage')){text('cadMessage','Credencial removida.');el('cadToken').value='';await pollCad();}});
 el('authorizeRemote').addEventListener('click',()=>post('/api/remoto',{valor:'ligar'},'cadMessage'));
 setInterval(()=>{if(lastContact&&Date.now()-lastContact>2500)clearLive();poll();},1000);setInterval(pollCad,3000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){clearLive();poll();pollCad();}});poll();pollCad();
})();
</script>

<script>
(function(){
'use strict';
const el=id=>document.getElementById(id);
const set=(id,value)=>{const node=el(id);if(node)node.textContent=String(value)};
const led=(id,on)=>{const node=el(id);if(node)node.dataset.on=String(Boolean(on))};
let sending=false;
window.cgdGatePanelUpdate=function(data){
 const cad=Boolean(data&&data.modo==='simulacao'&&data.simulacao_cad_atual&&data.estado_simulacao_disponivel);
 const bench=data?.bancada_reles||{};
 const testLabel=['vermelho','amarelo','verde','camisa','eixo','carga aberta','descarga aberta'][bench.teste_canal]||'LED';
 const authorized=bench.autorizacao_local===true;
 const active=Boolean((bench.armada||bench.teste_individual||bench.teste_local)&&authorized);
 const motor=Boolean(cad&&data.motor_digestor_simulado&&data.etapa_mecanica==='COZIMENTO');
 led('cg-motor-led',motor);
 set('cg-motor-state',motor?'LIGADO · SIMULADO':'PARADO · SIMULADO');
 led('p1led',active&&bench.camisa);led('p2led',active&&bench.eixo);
 for(const gate of ['carga','descarga']){
   const opened=Boolean(cad&&data.guilhotinas_simuladas?.[gate]==='ABERTA');
   const vis=el('cg-visual-'+gate);
   if(vis){vis.dataset.virtual=opened?'aberta':'fechada';vis.setAttribute('aria-label','Guilhotina de '+gate+(opened?' aberta':' fechada')+' virtual');}
   set('cg-virtual-'+gate,opened?'ABERTA · SIMULADA':'FECHADA · SIMULADA');
   set('cg-time-'+gate,String(data?.tempo_estado_guilhotinas_s?.[gate]||0)+' s');
   led('cg-led-'+gate,active&&(gate==='carga'?bench.carga_aberta:bench.descarga_aberta));
 }
 const stop=el('benchStop');
 if(stop)stop.disabled=sending||!data;
 document.querySelectorAll('[data-bench-stop]').forEach(button=>button.disabled=sending||!data);
 document.querySelectorAll('[data-bench-test]').forEach(button=>button.disabled=
   sending||!data||data.modo==='real'||!authorized||!bench.compatibilidade_pinos||bench.teste_individual);
 set('benchStatus',!data?'SEM CONTATO COM ESP32':!bench.compatibilidade_pinos?
   'PINAGEM BLOQUEADA · use ESP32 clássico com GPIO32/33 disponíveis':bench.teste_individual?
   'TESTE INDIVIDUAL · '+testLabel+' · '+Math.ceil((bench.teste_restante_ms||0)/1000)+' s · demais LEDs apagados':bench.armada?
   'ESPELHAMENTO CAD ATIVO · somente LEDs de bancada':bench.teste_local?'TESTE LOCAL DOS SINALEIROS · expiração automática':cad?
   (!authorized?'Feche a chave GPIO27-GND (build com chave obrigatória)':bench.bloqueada?
    'DESARMADO · selecione novamente Simulação CAD para retomar':'Aguardando espelhamento do pacote CAD'):
   '7 GPIOs disponíveis · teste local de 2 s ou selecione Simulação CAD');
 set('cg-gates-summary',active?'LEDS ATIVOS':'LEDS DESARMADOS');
 set('cg-digestor',data?.digestor||'1');
 set('cg-fw',data?.firmware||'Sem contato');
 set('cg-mode',data?.modo||'Sem contato');
 set('cg-key',!data?'SEM CONTATO':bench.chave_local_obrigatoria?(bench.chave_local_ativa?'JUMPER ATIVO':'JUMPER AUSENTE · BLOQUEADO'):'OPCIONAL · GPIOs LIBERADOS');
 set('cg-last','Somente LEDS de bancada');
 set('cg-io-status',!data?'Sem contato com ESP32':active?
   'Saídas de bancada ativas: GPIO25/26 purgadores, GPIO32 alimentação e GPIO33 descarga.':
   '7 canais disponíveis; aguardando teste local ou comandos atuais do CAD.');
 set('cg-feedback',cad?'Etapa CAD: '+(data.etapa_mecanica||'PARADO')+' · movimento virtual, sem fim de curso.':
  'Simulação CAD sem estado atual. Os indicadores não confirmam movimento físico.');
};
async function bench(action){
 if(sending)return;
 sending=true;
 const stop=el('benchStop');if(stop)stop.disabled=true;
 try{
   const response=await fetch('/api/bancada/reles',{method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'X-CGD-Local':'true','Content-Type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({valor:action})});
   const body=await response.text();
   set('benchMessage',response.ok?'Todos os LEDs desarmados. Selecione Simulação CAD para retomar.':
     'Falha na autorização: '+body.slice(0,210));
 }catch(e){set('benchMessage','Não foi possível comunicar com a bancada: '+e.message)}
 finally{sending=false}
}
el('benchStop')?.addEventListener('click',()=>bench('parar'));
document.querySelectorAll('[data-bench-stop]').forEach(button=>button.addEventListener('click',()=>bench('parar')));
document.querySelectorAll('[data-bench-test]').forEach(button=>button.addEventListener('click',async()=>{
 if(sending)return;sending=true;
 document.querySelectorAll('[data-bench-test]').forEach(item=>item.disabled=true);
 try{
   const response=await fetch('/api/bancada/teste',{method:'POST',credentials:'same-origin',cache:'no-store',
     signal:AbortSignal.timeout(3000),headers:{'X-CGD-Local':'true','Content-Type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({canal:button.dataset.benchTest})});
   const body=await response.text();
   set('benchMessage',response.ok?'Teste isolado por 2 segundos. Ao terminar, selecione Simulação CAD para retomar.':body.slice(0,210));
 }catch(error){set('benchMessage','Falha de comunicação local. O teste expira no ESP32.');}
 finally{sending=false;}
}));
})();
</script>
</body></html>)LOCALHTML";


// ===== bench_leds.h =====
// Portable state machine used unchanged by the host tests. No GPIO/Arduino calls.
namespace cgd {
struct BenchInput {
  bool cadMode=false, localMode=false, wifi=false, packet=false, complete=false, key=false, compatible=false;
  bool red=false, yellow=false, green=false, camisa=false, eixo=false;
  bool loadOpen=false, dischargeOpen=false;
  uint32_t receivedAt=0, validity=0;
};
struct BenchState {
  bool mirroring=false, local=false, testing=false, blocked=true;
  bool outputs[7]={false,false,false,false,false,false,false};
  int8_t testChannel=-1;
  uint32_t testRemaining=0;
};
class BenchLeds {
 public:
  static constexpr uint32_t MAX_VALIDITY_MS=6500U, MAX_GAP_MS=2000U, TEST_MS=2000U, COOLDOWN_MS=1000U;
  void selectCad(uint32_t now) {
    enabled_=true; blocked_=false; manualStop_=false; everActive_=false;
    test_=-1; lastTick_=now; ticked_=false; state_=BenchState();
  }
  void selectLocal(uint32_t now) { selectCad(now); }
  void stop() { blocked_=true; manualStop_=true; test_=-1; state_=BenchState(); }
  bool healthy(const BenchInput &i,uint32_t now) const {
    return (i.cadMode!=i.localMode)&&i.key&&i.compatible&&
      (i.localMode||(i.wifi&&i.packet&&i.complete))&&
      i.validity>0U&&i.validity<=MAX_VALIDITY_MS&&uint32_t(now-i.receivedAt)<=i.validity&&
      !(i.loadOpen&&i.dischargeOpen)&&!(i.camisa&&i.eixo)&&
      !(i.red&&i.yellow)&&!(i.red&&i.green)&&!(i.yellow&&i.green);
  }
  bool startTest(int8_t channel,const BenchInput &i,uint32_t now) {
    if(channel<0||channel>6||test_>=0||!i.key||!i.compatible||
       (usedTest_&&uint32_t(now-testStoppedAt_)<COOLDOWN_MS))return false;
    // Explicit local action, isolated from the CAD cycle. Expiry stays disarmed.
    stop(); test_=channel; testStartedAt_=now; ticked_=false; return true;
  }
  BenchState tick(const BenchInput &i,uint32_t now) {
    const bool rising=i.key&&!previousKey_; previousKey_=i.key;
    if(!i.cadMode&&!i.localMode&&test_<0){enabled_=false;stop();}
    // A deliberate OFF -> ON key cycle may reset a fault, never a manual stop/test.
    if(i.cadMode&&enabled_&&rising&&blocked_&&!manualStop_)selectCad(now);
    const bool stall=ticked_&&uint32_t(now-lastTick_)>MAX_GAP_MS;
    ticked_=true;lastTick_=now;
    state_=BenchState();state_.blocked=blocked_||!enabled_;
    if(test_>=0) {
      const uint32_t elapsed=uint32_t(now-testStartedAt_);
      if(stall||!i.key||!i.compatible||elapsed>=TEST_MS){
        test_=-1;usedTest_=true;testStoppedAt_=now;stop();return state_;
      }
      state_.testing=true;state_.testChannel=test_;state_.testRemaining=TEST_MS-elapsed;
      state_.outputs[test_]=true;return state_;
    }
    if((stall||!healthy(i,now))&&everActive_)blocked_=true;
    state_.blocked=blocked_||!enabled_;
    if(!enabled_||!healthy(i,now))return state_;
    if(blocked_)return state_;
    everActive_=true;state_.mirroring=i.cadMode;state_.local=i.localMode;state_.blocked=false;
    state_.outputs[0]=i.red;state_.outputs[1]=i.yellow;state_.outputs[2]=i.green;
    state_.outputs[3]=i.cadMode&&i.camisa;state_.outputs[4]=i.cadMode&&i.eixo;
    state_.outputs[5]=i.cadMode&&i.loadOpen;
    state_.outputs[6]=i.cadMode&&i.dischargeOpen;
    return state_;
  }
 private:
  bool enabled_=false,blocked_=true,manualStop_=true,everActive_=false;
  bool previousKey_=false,ticked_=false,usedTest_=false;
  uint32_t lastTick_=0,testStartedAt_=0,testStoppedAt_=0;
  int8_t test_=-1;
  BenchState state_;
};
}
// ===== bench_leds_end =====

/* INDICADORES DE DUAS GUILHOTINAS, EXCLUSIVAMENTE LEDS.
 * Nenhuma confirmacao mecanica; nao integrar como seguranca ou descarga automatica.
 * Chave GPIO27 opcional nesta build de bancada; pulso industrial permanece bloqueado.
 */
bool benchPinsCompatible=false;
class CgdGatePulse {
 public:
  static constexpr uint8_t N=2;
  const uint8_t p[N]={CGD_GATE_FEED_OPEN_GPIO,CGD_GATE_DISCHARGE_OPEN_GPIO};
  void begin(){
    if(!configured())return;
    pinMode(CGD_GATE_LOCAL_KEY_GPIO,INPUT_PULLUP);
    for(uint8_t i=0;i<N;i++){digitalWrite(p[i],offLevel());pinMode(p[i],OUTPUT);}
    forceOff();
  }
  bool configured()const{return CGD_ENABLE_MATERIAL_GATE_OUTPUTS==1&&benchPinsCompatible;}
  bool keyOn()const{return configured()&&digitalRead(CGD_GATE_LOCAL_KEY_GPIO)==LOW;}
  bool authorized()const{return configured()&&(!CGD_BENCH_REQUIRE_LOCAL_KEY||keyOn());}
  bool active()const{return loadOn_||dischargeOn_;}
  const char* last()const{return loadOn_?"CARGA_ABRIR":dischargeOn_?"DESCARGA_ABRIR":"RELES_DESLIGADOS_NC";}
  // One coil per gate: no separate CLOSE GPIO. Both deenergize on any stop/fault.
  void apply(bool allow,bool loadOpen,bool dischargeOpen){
    if(!configured()||!allow||!authorized()||(loadOpen&&dischargeOpen)){stop();return;}
    const bool on[N]={loadOpen,dischargeOpen};
    // Off first on change; never pulse a relay that remains energized.
    for(uint8_t i=0;i<N;i++)if(!on[i])digitalWrite(p[i],offLevel());
    for(uint8_t i=0;i<N;i++)if(on[i])digitalWrite(p[i],CGD_GATE_RELAY_ACTIVE_LEVEL);
    loadOn_=loadOpen;dischargeOn_=dischargeOpen;
  }
  void forceOff(){
    if(!configured())return;
    for(uint8_t i=0;i<N;i++)digitalWrite(p[i],offLevel());
  }
  void stop(){forceOff();loadOn_=dischargeOn_=false;}
 private:
  bool loadOn_=false,dischargeOn_=false;
  uint8_t offLevel()const{return CGD_GATE_RELAY_ACTIVE_LEVEL==LOW?HIGH:LOW;}
};
CgdGatePulse cgdGate;
static_assert(CGD_GATE_FEED_OPEN_GPIO!=CGD_GATE_DISCHARGE_OPEN_GPIO,"Pinos de guilhotinas duplicados");

/*
  CAMPO DO GADO · 2A Automação Industrial · ESP32-D0WD-V3 / ESP32 Dev Module
  Evolução do sketch bancada-v7 fornecido pelo responsável. V10 demonstrativo.
  Três sinaleiros ativos LOW; PT100 opt-in; purgadores LOW/fecha-sem-energia confirmados pelo responsável.
  NVS Wi-Fi/token preservada. Purga exige Armar+Iniciar local. Nenhum comando de comporta/descarga de material.
*/



















constexpr uint8_t DIGESTOR_ID = 1;
static_assert(DIGESTOR_ID >= 1 && DIGESTOR_ID <= 4, "Digestor deve ser 1 a 4");
const char* REDE_ESP32_NOME = DIGESTOR_ID == 1 ? "CampoDoGado-ESP32" :
  (DIGESTOR_ID == 2 ? "CampoDoGado-ESP32-D2" : (DIGESTOR_ID == 3 ? "CampoDoGado-ESP32-D3" : "CampoDoGado-ESP32-D4"));
const char* REDE_ESP32_SENHA = "CampoTeste32"; // AP de bancada já fornecido no sketch original.
constexpr uint8_t PINO_R = 18, PINO_A = 19, PINO_V = 21;
constexpr uint8_t RELE_LIGA = LOW, RELE_DESLIGA = HIGH;
constexpr uint32_t DURACAO_FASE_MS = 5000;
constexpr uint32_t VALIDADE_MAXIMA_REMOTA_MS = 6500;
const char *CAD_BASE = "https://manutencao.campodogado.app.br/api/automacao/device";
const char *CAD_FIRMWARE = "temperatura-v12-bancada-reles-leds-r3";
const char *CERTIFICADOS_CAD = R"CGCERT(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIDjjCCAnagAwIBAgIQAzrx5qcRqaC7KGSxHQn65TANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH
MjAeFw0xMzA4MDExMjAwMDBaFw0zODAxMTUxMjAwMDBaMGExCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IEcyMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuzfNNNx7a8myaJCtSnX/RrohCgiN9RlUyfuI
2/Ou8jqJkTx65qsGGmvPrC3oXgkkRLpimn7Wo6h+4FR1IAWsULecYxpsMNzaHxmx
1x7e/dfgy5SDN67sH0NO3Xss0r0upS/kqbitOtSZpLYl6ZtrAGCSYP9PIUkY92eQ
q2EGnI/yuum06ZIya7XzV+hdG82MHauVBJVJ8zUtluNJbd134/tJS7SsVQepj5Wz
tCO7TG1F8PapspUwtP1MVYwnSlcUfIKdzXOS0xZKBgyMUNGPHgm+F6HmIcr9g+UQ
vIOlCsRnKPZzFBQ9RnbDhxSJITRNrw9FDKZJobq7nMWxM4MphQIDAQABo0IwQDAP
BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAdBgNVHQ4EFgQUTiJUIBiV
5uNu5g/6+rkS7QYXjzkwDQYJKoZIhvcNAQELBQADggEBAGBnKJRvDkhj6zHd6mcY
1Yl9PMWLSn/pvtsrF9+wX3N3KjITOYFnQoQj8kVnNeyIv/iPsGEMNKSuIEyExtv4
NeF22d+mQrvHRAiGfzZ0JFrabA0UWTW98kndth/Jsw1HKj2ZL7tcu7XUIOGZX1NG
Fdtom/DzMNU+MeKNhJ7jitralj41E6Vf8PlwUHBHQRFXGU7Aj64GxJUTFy8bJZ91
8rGOmaFvE7FBcf6IKshPECBV1/MUReXgRPTqh5Uykw7+U0b6LJ3/iyK5S9kJRaTe
pLiaWN0bfVKfjllDiIGknibVb63dDcY3fe0Dkhvld1927jyNxF1WW6LZZm6zNTfl
MrY=
-----END CERTIFICATE-----
)CGCERT";

WebServer servidor(80);
Preferences preferencias, preferenciasCAD, preferenciasPurga;
String wifiSalvoNome, wifiSalvoSenha, wifiPendenteNome, wifiPendenteSenha;
String mensagemWifi = "Aguardando configuracao";
bool wifiTentando = false, salvarAposConectar = false;
uint32_t inicioWifi = 0, ultimaTentativaSalva = 0;
constexpr uint32_t LIMITE_WIFI_MS = 25000, NOVA_TENTATIVA_MS = 60000;
SemaphoreHandle_t mutexCredencial = nullptr, mutexEstado = nullptr;
String tokenCAD;
volatile int statusCAD = 0, ultimoHttpCAD = 0;
volatile uint32_t ultimoEnvioCAD = 0;

enum Modo : uint8_t { PARADO, MANUAL, AUTOMATICO, SIMULACAO, REMOTO_BANCADA, OPERACAO_REAL };
Modo modo = PARADO;
uint8_t fase = 0;
int8_t corManual = -1;
uint32_t inicioFase = 0;
struct RemoteCommand {
  bool valid = false, everReceived = false, completeState = false, heating = false;
  bool purgeOpen[2] = {false, false};  // Legado de protocolo; nao habilita ciclo industrial.
  bool purgeVisualOpen[2] = {false, false};
  bool gateVisualOpen[2] = {false, false}; // Ilustracao e LEDs; nunca bobina industrial.
  bool pusherVisualOpen[2] = {false, false};
  bool motorVisualOn = false;
  char mechanicalStage[20] = "PARADO";
  float temperature = NAN;
  uint32_t receivedAt = 0, validity = 0, generation = 0;
  int32_t version = -1;
  int8_t receivedPhase = -1;
} remoteCommand;
struct LocalSnapshot {
  Modo mode = PARADO;
  cgd::Signal signal = cgd::unavailable(cgd::SensorStatus::SEM_SENSOR);
  time_t measuredAt = 0;
  uint16_t measuredMillis = 0;
  uint32_t sampledAt = 0, updatedAt = 0, cadValidity = 0;
  int32_t version = -1;
  int8_t receivedPhase = -1;
  bool red = false, yellow = false, green = false;
  cgd::Color previewColor=cgd::Color::DESLIGADO;
  bool previewRed=false,previewYellow=false,previewGreen=false;
  bool cadCurrent = false, cadExpired = false, cadComplete = false, heating = false;
  bool purgeVirtualOpen[2] = {false, false};
  bool purgeDisplayOpen[2] = {false, false};
  bool gateDisplayOpen[2] = {false, false};
  bool pusherDisplayOpen[2] = {false, false};
  bool motorDisplayOn = false;
  char mechanicalStage[20] = "PARADO";
  cgd::BenchState bench;
} localSnapshot;
cgd::PurgeTimer purgadores[2] = { cgd::PurgeTimer(5, 60), cgd::PurgeTimer(10, 60) };
PurgeOutputs purgeOutputs;
cgd::CadPurgeTest cadPurgeTest;
cgd::BenchLeds benchLeds; // VOLATIL: nenhuma autorizacao restaurada da NVS.
uint32_t gateChangedAt[2]={0,0};
bool gatePrevOpen[2]={false,false};
Pt100Reader pt100;
bool pt100Configurado = false;

cgd::BenchInput benchInput(uint32_t now) {
  cgd::BenchInput i;
  i.cadMode=modo==REMOTO_BANCADA;i.wifi=WiFi.status()==WL_CONNECTED;
  i.packet=remoteCommand.valid;i.complete=remoteCommand.completeState;
  i.key=cgdGate.authorized();i.compatible=benchPinsCompatible&&purgeOutputs.configured()&&cgdGate.configured();
  i.receivedAt=remoteCommand.receivedAt;i.validity=remoteCommand.validity;
  const auto pins=cgd::requestedPins(cgd::classify(remoteCommand.temperature),now,true);
  i.red=pins.red;i.yellow=pins.yellow;i.green=pins.green;
  i.camisa=remoteCommand.pusherVisualOpen[0];i.eixo=remoteCommand.pusherVisualOpen[1];
  i.loadOpen=remoteCommand.gateVisualOpen[0];i.dischargeOpen=remoteCommand.gateVisualOpen[1];
  return i;
}

String escaparJSON(const String &texto) {
  String out;
  for (size_t i = 0; i < texto.length(); ++i) {
    const unsigned char c = texto[i];
    if (c == '\"' || c == '\\') { out += '\\'; out += char(c); }
    else if (c == '\n') out += "\\n";
    else if (c == '\r') out += "\\r";
    else if (c < 0x20) out += ' ';
    else out += char(c);
  }
  return out;
}

String copiarTokenCAD() {
  String t;
  if (mutexCredencial && xSemaphoreTake(mutexCredencial, pdMS_TO_TICKS(1000)) == pdTRUE) {
    t = tokenCAD; xSemaphoreGive(mutexCredencial);
  }
  return t;
}
bool guardarTokenCAD(const String &novo) {
  if (novo.length() > 200 || (novo.length() && (!novo.startsWith("cgd_") || novo.length() < 30))) return false;
  if (!mutexCredencial || xSemaphoreTake(mutexCredencial, pdMS_TO_TICKS(1000)) != pdTRUE) return false;
  tokenCAD = novo; preferenciasCAD.putString("token", novo); xSemaphoreGive(mutexCredencial);
  statusCAD = 0; ultimoHttpCAD = 0; return true;
}
bool snapshot(LocalSnapshot &copy) {
  if (!mutexEstado || xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) return false;
  copy = localSnapshot; xSemaphoreGive(mutexEstado);
  if (millis() - copy.updatedAt > 1250U) {
    copy.signal = cgd::unavailable(cgd::SensorStatus::SEM_SINAL);
    copy.red = copy.yellow = copy.green = false; copy.measuredAt = 0;
    copy.previewColor=cgd::Color::DESLIGADO;copy.previewRed=copy.previewYellow=copy.previewGreen=false;
    copy.cadCurrent = false; copy.cadComplete = false; copy.heating = false;
    copy.purgeVirtualOpen[0] = copy.purgeVirtualOpen[1] = false;
    copy.gateDisplayOpen[0]=copy.gateDisplayOpen[1]=false;
    copy.pusherDisplayOpen[0]=copy.pusherDisplayOpen[1]=false;
    copy.bench=cgd::BenchState();
  }
  return true;
}
const char* nomeModo(Modo value) {
  switch (value) {
    case MANUAL: return "manual";
    case AUTOMATICO: return "automatico";
    case SIMULACAO: return "teste";
    case REMOTO_BANCADA: return "simulacao";
    case OPERACAO_REAL: return "real";
    default: return "parado";
  }
}
String deviceId() { return "ESP32-DIGESTOR-" + String(DIGESTOR_ID < 10 ? "0" : "") + String(DIGESTOR_ID); }
String timestampISO(time_t epoch, uint16_t ms) {
  if (epoch < 1700000000) return "";
  struct tm utc; gmtime_r(&epoch, &utc); char out[25];
  strftime(out, sizeof(out), "%Y-%m-%dT%H:%M:%S", &utc);
  char suffix[8]; snprintf(suffix, sizeof(suffix), ".%03uZ", unsigned(ms)); return String(out) + suffix;
}
void preencherSinal(JsonDocument &doc, const LocalSnapshot &s, bool localPage = false) {
  const bool real = s.mode == OPERACAO_REAL;
  doc["origem"] = real ? "REAL" : "SIMULACAO";
  if (s.signal.hasTemperature) doc["temperatura_c"] = s.signal.temperatureC;
  else doc["temperatura_c"] = nullptr;
  doc["faixa_temperatura"] = cgd::name(s.signal.range);
  doc["cor_sinaleiro"] = cgd::name(s.signal.color);
  doc["pronto_descarga"] = s.signal.ready;
  doc["sensor_tipo"] = real ? "PT100" : (s.signal.hasTemperature ? "SIMULADO" : nullptr);
  doc["sensor_status"] = real ? cgd::name(s.signal.sensorStatus) : (s.signal.hasTemperature ? "SIMULADO" :
    (localPage && s.mode == REMOTO_BANCADA ? (s.cadExpired ? "SIMULACAO_EXPIRADA" : "AGUARDANDO_SIMULACAO") : "SEM_SINAL"));
  if (!real) doc["fonte_simulacao"] = s.mode == REMOTO_BANCADA ? "CAD" : "LOCAL";
  doc["simulacao_cad_atual"] = s.cadCurrent;
  doc["estado_simulacao_disponivel"] = s.cadComplete;
  doc["aquecimento_simulado"] = s.cadComplete && s.heating;
  JsonObject virtualPurges = doc["purgadores_simulados"].to<JsonObject>();
  virtualPurges["camisa"] = s.cadComplete && s.purgeVirtualOpen[0] ? "ABERTO" : "FECHADO";
  virtualPurges["eixo"] = s.cadComplete && s.purgeVirtualOpen[1] ? "ABERTO" : "FECHADO";
  JsonObject displayPurges = doc["purgadores_visuais"].to<JsonObject>();
  displayPurges["camisa"] = s.cadCurrent && s.cadComplete && s.purgeDisplayOpen[0] ? "ABERTO" : "FECHADO";
  displayPurges["eixo"] = s.cadCurrent && s.cadComplete && s.purgeDisplayOpen[1] ? "ABERTO" : "FECHADO";
  JsonObject displayGates = doc["guilhotinas_simuladas"].to<JsonObject>();
  displayGates["carga"] = s.cadCurrent && s.cadComplete && s.gateDisplayOpen[0] ? "ABERTA" : "FECHADA";
  displayGates["descarga"] = s.cadCurrent && s.cadComplete && s.gateDisplayOpen[1] ? "ABERTA" : "FECHADA";
  JsonObject pushers = doc["empurradores_simulados"].to<JsonObject>();
  pushers["camisa"] = s.cadCurrent && s.cadComplete && s.pusherDisplayOpen[0] ? "ABERTO" : "FECHADO";
  pushers["eixo"] = s.cadCurrent && s.cadComplete && s.pusherDisplayOpen[1] ? "ABERTO" : "FECHADO";
  doc["motor_digestor_simulado"] = s.cadCurrent && s.cadComplete && s.motorDisplayOn;
  doc["motor_digestor_real_monitorado"] = false; // Sinal real ainda não foi instrumentado/validado.
  doc["etapa_mecanica"] = s.cadCurrent && s.cadComplete ? s.mechanicalStage : "PARADO";
  const String stamp = real && s.signal.hasTemperature ? timestampISO(s.measuredAt, s.measuredMillis) : "";
  if (stamp.length()) doc["timestamp_medicao"] = stamp;
  else doc["timestamp_medicao"] = nullptr;
}

bool localPostAllowed() {
  const String host = servidor.hostHeader();
  String hostOnly = host; const int colon = hostOnly.indexOf(':'); if (colon >= 0) hostOnly = hostOnly.substring(0, colon);
  const bool localHost = hostOnly == WiFi.softAPIP().toString() ||
    (WiFi.status() == WL_CONNECTED && hostOnly == WiFi.localIP().toString());
  const String origin = servidor.header("Origin");
  if (servidor.header("X-CGD-Local") != "true" || !localHost ||
      (origin.length() && origin != String("http://") + host)) {
    servidor.send(403, "text/plain", "Abra a IHM diretamente no IP local do ESP32."); return false;
  }
  return true;
}
void jsonResponse(const JsonDocument &doc, int code = 200) {
  String out; serializeJson(doc, out); servidor.sendHeader("Cache-Control", "no-store");
  servidor.send(code, "application/json; charset=utf-8", out);
}
void escreverSaidas(bool red, bool yellow, bool green) {
  const uint8_t pins[3] = {PINO_R, PINO_A, PINO_V};
  const bool desired[3] = {red, yellow, green};
  // Desligar primeiro evita sobreposição ao mudar de cor.
  for (int i = 0; i < 3; ++i) if (!desired[i]) digitalWrite(pins[i], RELE_DESLIGA);
  for (int i = 0; i < 3; ++i) if (desired[i]) digitalWrite(pins[i], RELE_LIGA);
}

void tarefaSinalizacao(void*) {
  cgd::LocalSignals localReal(cgd::Mode::REAL), localSimulation(cgd::Mode::SIMULACAO);
  uint32_t lastRead = 0, lastCommand = UINT32_MAX;
  cgd::Signal acquired = cgd::unavailable(cgd::SensorStatus::SEM_SENSOR);
  time_t acquisitionEpoch = 0; uint16_t acquisitionMillis = 0;
  Modo previousMode = PARADO; bool synchronizationFault = false;
  while (true) {
    const uint32_t now = millis();
    if (pt100Configurado && now - lastRead >= 250) {
      acquired = pt100.read(); struct timeval measured; gettimeofday(&measured, nullptr);
      acquisitionEpoch = measured.tv_sec; acquisitionMillis = measured.tv_usec / 1000; lastRead = now;
      localReal.sampleReal(acquired.temperatureC, acquired.sensorStatus, now);
    }
    if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(5)) == pdTRUE) {
      if (synchronizationFault) {
        modo = PARADO; corManual = -1; remoteCommand.valid = false;
        benchLeds.stop(); for(auto &p:purgadores)p.fault(); purgeOutputs.stopAll(); cadPurgeTest.stopAll(); cgdGate.stop(); synchronizationFault=false;
      }
      LocalSnapshot next; next.updatedAt = now;
      next.mode = modo;
      if(previousMode!=modo){purgeOutputs.stopAll();cgdGate.stop();lastCommand=UINT32_MAX;previousMode=modo;localSimulation.stopSimulation();}
      if (modo == OPERACAO_REAL) {
        next.signal = pt100Configurado ? localReal.current(now) : cgd::unavailable(cgd::SensorStatus::SEM_SENSOR);
        next.measuredAt = next.signal.hasTemperature ? acquisitionEpoch : 0;
        next.measuredMillis = acquisitionMillis;
        next.sampledAt = lastRead;
      } else if (modo == REMOTO_BANCADA) {
        const bool valid = remoteCommand.valid && WiFi.status() == WL_CONNECTED &&
          cgd::fresh(now, remoteCommand.receivedAt, remoteCommand.validity);
        if (valid) {
          if (lastCommand != remoteCommand.generation) {
            localSimulation.simulate(remoteCommand.temperature, remoteCommand.receivedAt, remoteCommand.validity);
            lastCommand = remoteCommand.generation;
          }
          next.signal = localSimulation.current(now);
          next.version = remoteCommand.version; next.receivedPhase = remoteCommand.receivedPhase;
          next.sampledAt = remoteCommand.receivedAt;
          next.cadValidity = remoteCommand.validity;
          next.cadCurrent = true; next.cadComplete = remoteCommand.completeState;
          next.heating = remoteCommand.heating;
          next.purgeVirtualOpen[0] = remoteCommand.purgeOpen[0]; next.purgeVirtualOpen[1] = remoteCommand.purgeOpen[1];
          next.purgeDisplayOpen[0] = remoteCommand.purgeVisualOpen[0]; next.purgeDisplayOpen[1] = remoteCommand.purgeVisualOpen[1];
          next.gateDisplayOpen[0] = remoteCommand.gateVisualOpen[0]; next.gateDisplayOpen[1] = remoteCommand.gateVisualOpen[1];
          next.pusherDisplayOpen[0] = remoteCommand.pusherVisualOpen[0];
          next.pusherDisplayOpen[1] = remoteCommand.pusherVisualOpen[1];
          next.motorDisplayOn = remoteCommand.motorVisualOn;
          strncpy(next.mechanicalStage, remoteCommand.mechanicalStage, sizeof(next.mechanicalStage)-1);
          next.mechanicalStage[sizeof(next.mechanicalStage)-1] = '\0';
        } else next.cadExpired = remoteCommand.everReceived;
      } else if (modo == AUTOMATICO || modo == SIMULACAO) {
        uint32_t elapsed = now - inicioFase;
        if (elapsed >= DURACAO_FASE_MS) {
          if (modo == AUTOMATICO && fase < 3) { ++fase; inicioFase = now; }
          else { modo = PARADO; next.mode = PARADO; for (auto &p : purgadores) p.stop(); purgeOutputs.stopAll(); cadPurgeTest.stopAll(); cgdGate.stop(); }
        }
        if (modo == AUTOMATICO || modo == SIMULACAO) {
          const float values[] = {25, 75, 110, 125};
          next.signal = cgd::classify(values[fase]); next.sampledAt = now;
        }
      }
      if(modo==MANUAL&&uint32_t(now-inicioFase)>=DURACAO_FASE_MS){
        modo=PARADO;next.mode=PARADO;corManual=-1;benchLeds.stop();
      }
      cgd::Pins pins = cgd::requestedPins(next.signal, now, true);
      if (modo == MANUAL) {
        pins = {corManual == 2, corManual == 1, corManual == 0};
        next.signal.color = corManual == 0 ? cgd::Color::VERMELHO :
          (corManual == 1 ? cgd::Color::AMARELO : (corManual == 2 ? cgd::Color::VERDE : cgd::Color::DESLIGADO));
      }
      if (modo == PARADO) pins = {false, false, false};
      next.previewColor=next.signal.color;
      next.previewRed=pins.red;next.previewYellow=pins.yellow;next.previewGreen=pins.green;
      auto input=benchInput(now);
      if(modo==MANUAL||modo==AUTOMATICO||modo==SIMULACAO){
        input.localMode=true;input.receivedAt=inicioFase;input.validity=DURACAO_FASE_MS;
        input.red=pins.red;input.yellow=pins.yellow;input.green=pins.green;
        input.camisa=input.eixo=input.loadOpen=input.dischargeOpen=false;
      }
      next.bench=benchLeds.tick(input,now);
      pins={next.bench.outputs[2],next.bench.outputs[1],next.bench.outputs[0]};
      if(!next.bench.mirroring&&!next.bench.local){next.signal.color=cgd::Color::DESLIGADO;next.signal.ready=false;}
      escreverSaidas(pins.red, pins.yellow, pins.green);
      next.red = pins.red; next.yellow = pins.yellow; next.green = pins.green;
      localSnapshot = next;
      cadPurgeTest.update(false, WiFi.status() == WL_CONNECTED,
        remoteCommand.valid && remoteCommand.completeState, now, remoteCommand.receivedAt,
        remoteCommand.validity, remoteCommand.purgeOpen[0], remoteCommand.purgeOpen[1]);
      const bool benchActive=next.bench.mirroring||next.bench.local||next.bench.testing;
      // Relés LEDs da bancada: cada purgador alterna conforme os estados do CAD.
      purgeOutputs.applyBench(benchActive,next.bench.outputs[3],next.bench.outputs[4]);
      for(int i=0;i<2;i++){
        if(modo==REMOTO_BANCADA){
          purgadores[i].stop();cadPurgeTest.stop(i);
          continue;
        }
        const bool healthy = modo == PARADO || (modo == OPERACAO_REAL && next.signal.hasTemperature);
        if (modo == OPERACAO_REAL && !next.signal.hasTemperature) { purgadores[i].fault(); purgeOutputs.stop(i); }
        const bool wasActive = purgadores[i].isActive();
        const auto timer = purgadores[i].tick(now);
        // Armar mantém fechado sem iniciar; apenas falha real/stall desarma.
        if (purgeOutputs.armed(i) && (!healthy || (wasActive && !timer.active))) {
          purgadores[i].stop(); purgeOutputs.stop(i);
        }
        // Temporizadores locais de purga continuam virtuais; teste fisico usa BenchLeds.
      }
      cgdGate.apply(benchActive,next.bench.outputs[5],next.bench.outputs[6]);
      if(modo==REMOTO_BANCADA){
        for(int i=0;i<2;i++){
          if(!next.cadCurrent||!next.cadComplete){gateChangedAt[i]=0;gatePrevOpen[i]=false;}
          else if(!gateChangedAt[i]||gatePrevOpen[i]!=next.gateDisplayOpen[i]){
            gatePrevOpen[i]=next.gateDisplayOpen[i];gateChangedAt[i]=now;
          }
        }
      }else{
        gateChangedAt[0]=gateChangedAt[1]=0;
        gatePrevOpen[0]=gatePrevOpen[1]=false;
      }
      xSemaphoreGive(mutexEstado);
    } else {
      // Falha de sincronização não retém lâmpada/válvula ligada. Latch exige novo armamento.
      escreverSaidas(false, false, false); purgeOutputs.forceOff(); cgdGate.forceOff(); synchronizationFault = true;
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

int fazerPostCAD(const String &rota, const String &token, const String &json, String *resposta = nullptr) {
  WiFiClientSecure tls; tls.setCACert(CERTIFICADOS_CAD); tls.setTimeout(3);
  HTTPClient http; if (!http.begin(tls, String(CAD_BASE) + rota)) return -10;
  http.setConnectTimeout(3000); http.setTimeout(3000);
  http.addHeader("Authorization", String("Bearer ") + token);
  http.addHeader("Content-Type", "application/json");
  const int code = http.POST(json);
  if (resposta && code == 200) *resposta = http.getString();
  http.end(); return code;
}
String payloadTelemetria(const LocalSnapshot &s) {
  LocalSnapshot published=s;
  if(s.mode!=REMOTO_BANCADA||!s.bench.mirroring){
    published.signal=cgd::unavailable(cgd::SensorStatus::SEM_SINAL);
    published.cadCurrent=published.cadComplete=published.heating=false;
  }
  JsonDocument doc; doc["device_id"] = deviceId(); doc["digestor_id"] = DIGESTOR_ID;
  doc["fase"] = cgd::phase(published.signal);
  if (s.mode != MANUAL) doc["fase_aplicada"] = cgd::phase(published.signal);
  if (s.mode == REMOTO_BANCADA) {
    doc["fase_recebida"] = s.receivedPhase == 0 ? "INICIO" :
      (s.receivedPhase == 1 ? "MEIO" : (s.receivedPhase == 2 ? "FINAL" : "PARADO"));
    if (s.version >= 0) doc["versao_fase"] = s.version;
  }
  // Supervisao publica PARADO/SEM_SINAL quando os GPIOs nao espelham o CAD.
  // A leitura e a previa virtual locais continuam no snapshot original da IHM.
  preencherSinal(doc,published);
  doc["firmware"] = CAD_FIRMWARE; doc["uptime_s"] = millis() / 1000;
  doc["wifi_rssi"] = WiFi.RSSI();
  // GPIO comandado não comprova retorno elétrico: nunca enviar saida_confirmada.
  String out; serializeJson(doc, out); return out;
}
bool receberSimulacaoCAD(const String &body) {
  cgd::CadSimulationCommand command;
  if (!cgd::parseCadSimulationJson(body.c_str(), body.length(), DIGESTOR_ID, command)) return false;
  // Estados abaixo comandam apenas LEDs na V12. Nenhuma bobina industrial conectada.
  JsonDocument mirror;
  if (deserializeJson(mirror, body, DeserializationOption::NestingLimit(8))) return false;
  JsonObject mirrored = mirror["sinaleiro_bancada"].as<JsonObject>();
  const char* visualCamisa = mirrored["purgadores_visuais"]["camisa"].as<const char*>();
  const char* visualEixo = mirrored["purgadores_visuais"]["eixo"].as<const char*>();
  const char* visualCarga = mirrored["guilhotinas_simuladas"]["carga"].as<const char*>();
  const char* visualDescarga = mirrored["guilhotinas_simuladas"]["descarga"].as<const char*>();
  const char* pusherCamisa = mirrored["empurradores_simulados"]["camisa"].as<const char*>();
  const char* pusherEixo = mirrored["empurradores_simulados"]["eixo"].as<const char*>();
  JsonVariant motorVirtual = mirrored["motor_digestor_simulado"];
  const char* visualStage = mirrored["etapa_mecanica"].as<const char*>();
  const auto mirrorPurge = [](const char *v) { return v && (strcmp(v, "ABERTO") == 0 || strcmp(v, "FECHADO") == 0); };
  const auto mirrorGate = [](const char *v) { return v && (strcmp(v, "ABERTA") == 0 || strcmp(v, "FECHADA") == 0); };
  const bool visualValid = command.active && command.completeState &&
    mirrorPurge(visualCamisa) && mirrorPurge(visualEixo) &&
    mirrorGate(visualCarga) && mirrorGate(visualDescarga) &&
    !(cgd::exact(visualCarga,"ABERTA")&&cgd::exact(visualDescarga,"ABERTA"));
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) return false;
  if (modo == REMOTO_BANCADA) {
    remoteCommand.valid = command.active; remoteCommand.everReceived = command.active;
    remoteCommand.completeState = visualValid;
    remoteCommand.heating = command.heating;
    remoteCommand.purgeOpen[0] = command.purgeOpen[0]; remoteCommand.purgeOpen[1] = command.purgeOpen[1];
    remoteCommand.purgeVisualOpen[0] = visualValid && strcmp(visualCamisa, "ABERTO") == 0;
    remoteCommand.purgeVisualOpen[1] = visualValid && strcmp(visualEixo, "ABERTO") == 0;
    remoteCommand.gateVisualOpen[0] = visualValid && strcmp(visualCarga, "ABERTA") == 0;
    remoteCommand.gateVisualOpen[1] = visualValid && strcmp(visualDescarga, "ABERTA") == 0;
    // Empurradores legados opcionais; na ausencia, espelhar os purgadores visuais.
    const bool pusherValid = visualValid && mirrorPurge(pusherCamisa) && mirrorPurge(pusherEixo);
    remoteCommand.pusherVisualOpen[0] = pusherValid ? strcmp(pusherCamisa,"ABERTO")==0 : remoteCommand.purgeVisualOpen[0];
    remoteCommand.pusherVisualOpen[1] = pusherValid ? strcmp(pusherEixo,"ABERTO")==0 : remoteCommand.purgeVisualOpen[1];
    remoteCommand.motorVisualOn = visualValid && motorVirtual.is<bool>() && motorVirtual.as<bool>();
    strncpy(remoteCommand.mechanicalStage, "PARADO", sizeof(remoteCommand.mechanicalStage));
    if (visualValid && visualStage) {
      const char* validStages[] = {"PARADO","CARGA","COZIMENTO","DESCARGA","TRANSFERENCIA","CONCLUIDO"};
      for (auto entry : validStages) if (strcmp(visualStage, entry) == 0) {
        strncpy(remoteCommand.mechanicalStage, entry, sizeof(remoteCommand.mechanicalStage)-1);
        break;
      }
    }
    remoteCommand.mechanicalStage[sizeof(remoteCommand.mechanicalStage)-1] = '\0';
    remoteCommand.temperature = command.temperature; remoteCommand.validity = command.validity;
    remoteCommand.receivedAt = millis(); ++remoteCommand.generation;
    remoteCommand.version = command.version; remoteCommand.receivedPhase = command.phase;
  }
  xSemaphoreGive(mutexEstado); return true;
}
void invalidarRemoto() {
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) == pdTRUE) {
    remoteCommand.valid = false; ++remoteCommand.generation; xSemaphoreGive(mutexEstado);
  }
}
void tarefaCAD(void*) {
  uint32_t lastPoll = 0, lastReport = 0, retryAt = 0;
  bool clockConfigured = false; String previousToken;
  Modo lastReportedMode = PARADO; cgd::Color lastReportedColor = cgd::Color::DESLIGADO;
  while (true) {
    vTaskDelay(pdMS_TO_TICKS(100));
    if (WiFi.status() != WL_CONNECTED) { statusCAD = 1; clockConfigured = false; invalidarRemoto(); continue; }
    if (!clockConfigured) { configTime(0, 0, "pool.ntp.org", "time.google.com"); clockConfigured = true; }
    time_t epoch; time(&epoch); if (epoch < 1700000000) { statusCAD = 2; continue; }
    const String token = copiarTokenCAD();
    if (token.isEmpty()) { statusCAD = 0; previousToken = ""; invalidarRemoto(); continue; }
    if (token != previousToken) {
      previousToken = token; retryAt = 0; lastPoll = 0; lastReport = 0; invalidarRemoto();
    }
    const uint32_t now = millis(); if (retryAt && int32_t(now - retryAt) < 0) continue;
    LocalSnapshot s; if (!snapshot(s)) continue;
    if (s.mode == REMOTO_BANCADA && (!lastPoll || now - lastPoll >= 1000)) {
      lastPoll = now; String response;
      const int code = fazerPostCAD("/sinaleiro-bancada", token,
        String("{\"digestor_id\":") + String(DIGESTOR_ID) + "}", &response);
      ultimoHttpCAD = code;
      if (code != 200 || !receberSimulacaoCAD(response)) {
        invalidarRemoto(); statusCAD = (code == 401 || code == 403 || code == 429) ? 5 : 6;
        retryAt = millis() + (statusCAD == 5 ? 60000U : 3000U); continue;
      }
      statusCAD = 4;
      vTaskDelay(pdMS_TO_TICKS(20)); // permitir que a tarefa local aplique a nova cópia.
    }
    if (!snapshot(s)) continue; // nunca relatar o estado anterior ao poll/mudança local.
    const bool changed = s.mode != lastReportedMode || s.signal.color != lastReportedColor;
    if (changed || !lastReport || millis() - lastReport >= 2000) {
      // Não inventar UTC: indicação local real continua enquanto o relógio sincroniza.
      if (s.mode == OPERACAO_REAL && s.signal.hasTemperature && s.measuredAt < 1700000000) continue;
      const int code = fazerPostCAD("/estado", token, payloadTelemetria(s));
      ultimoHttpCAD = code; lastReport = millis();
      if (code == 200) { statusCAD = 4; ultimoEnvioCAD = millis(); lastReportedMode = s.mode; lastReportedColor = s.signal.color; }
      else { statusCAD = (code == 401 || code == 403 || code == 429) ? 5 : 6;
        retryAt = millis() + (statusCAD == 5 ? 60000U : 3000U);
        if (s.mode == REMOTO_BANCADA) invalidarRemoto(); }
    }
  }
}

void enviarEstado() {
  LocalSnapshot s; if (!snapshot(s)) { servidor.send(503, "text/plain", "Atualizando estado"); return; }
  JsonDocument doc;
  doc["digestor"] = DIGESTOR_ID; doc["digestor_id"] = DIGESTOR_ID; doc["device_id"] = deviceId();
  doc["modo"] = nomeModo(s.mode); doc["fase"] = fase;
  doc["vermelho"] = s.red; doc["amarelo"] = s.yellow; doc["verde"] = s.green;
  doc["cor_sinaleiro_virtual"]=cgd::name(s.previewColor);
  doc["vermelho_virtual"]=s.previewRed;doc["amarelo_virtual"]=s.previewYellow;doc["verde_virtual"]=s.previewGreen;
  doc["restante_ms"] = (s.mode == AUTOMATICO || s.mode == SIMULACAO) ?
    (millis() - inicioFase < DURACAO_FASE_MS ? DURACAO_FASE_MS - (millis() - inicioFase) : 0) : 0;
  doc["remoto_restante_s"] = 0; doc["simulacao_persistente"] = s.mode == REMOTO_BANCADA;
  preencherSinal(doc, s, true);
  // GPIOs sao apenas LEDs; sem fim de curso, nao inferir abertura mecanica.
  JsonObject materialGates = doc["guilhotinas"].to<JsonObject>();
  materialGates["carregamento"] = "SEM_RETORNO_FISICO";
  materialGates["descarga"] = "SEM_RETORNO_FISICO";
  materialGates["saidas_habilitadas"] = cgdGate.configured();
  materialGates["chave_local_ativa"] = cgdGate.keyOn();
  materialGates["pulso_ativo"] = false;
  materialGates["reles_ativos"] = cgdGate.active();
  materialGates["ultimo_comando_local"] = cgdGate.last();
  materialGates["comandos_remotos_habilitados"] = false; // producao: nao
  materialGates["indicadores_led_cad_habilitados"] = s.bench.mirroring;
  JsonObject bench=doc["bancada_reles"].to<JsonObject>();
  bench["armada"]=s.bench.mirroring;
  bench["autoespelhamento"]=true;
  bench["bloqueada"]=s.bench.blocked;
  bench["compatibilidade_pinos"]=benchPinsCompatible;
  bench["teste_individual"]=s.bench.testing;
  bench["teste_canal"]=s.bench.testChannel;
  bench["teste_restante_ms"]=s.bench.testRemaining;
  bench["chave_local_ativa"]=cgdGate.keyOn();
  bench["chave_local_obrigatoria"]=bool(CGD_BENCH_REQUIRE_LOCAL_KEY);
  bench["autorizacao_local"]=cgdGate.authorized();
  bench["teste_local"]=s.bench.local;
  bench["cad_atual"]=s.cadCurrent&&s.cadComplete;
  bench["somente_lampadas"]=true;
  bench["validade_comando_restante_ms"]=s.cadCurrent&&uint32_t(millis()-s.sampledAt)<s.cadValidity ?
    s.cadValidity-uint32_t(millis()-s.sampledAt):0;
  bench["camisa"]=s.bench.outputs[3];bench["eixo"]=s.bench.outputs[4];
  bench["carga_aberta"]=s.bench.outputs[5];bench["descarga_aberta"]=s.bench.outputs[6];
  bench["carga_rele_energizado"]=s.bench.outputs[5];
  bench["descarga_rele_energizado"]=s.bench.outputs[6];
  bench["gpio_carga"]=CGD_GATE_FEED_OPEN_GPIO;bench["gpio_descarga"]=CGD_GATE_DISCHARGE_OPEN_GPIO;
  bench["total_canais"]=7;
  JsonObject held=doc["tempo_estado_guilhotinas_s"].to<JsonObject>();
  held["carga"]=s.cadCurrent&&gateChangedAt[0]?(millis()-gateChangedAt[0])/1000U:0;
  held["descarga"]=s.cadCurrent&&gateChangedAt[1]?(millis()-gateChangedAt[1])/1000U:0;
  doc["pt100_habilitado"] = pt100Configurado;
  doc["sensores_integrados"] = pt100Configurado; doc["saidas_habilitadas"] = true;
  doc["wifi_conectado"] = WiFi.status() == WL_CONNECTED; doc["wifi_tentando"] = wifiTentando;
  doc["wifi_ssid"] = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : wifiPendenteNome;
  doc["wifi_ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "";
  doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
  doc["wifi_mensagem"] = mensagemWifi; doc["wifi_rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  doc["uptime_s"] = millis() / 1000; doc["firmware"] = CAD_FIRMWARE;
  time_t epoch; time(&epoch); doc["clock_sync"] = epoch >= 1700000000;
  doc["cad_status"] = int(statusCAD); doc["ultimo_http_cad"] = int(ultimoHttpCAD);
  if (ultimoEnvioCAD) doc["ultimo_envio_s"] = (millis() - ultimoEnvioCAD) / 1000;
  else doc["ultimo_envio_s"] = nullptr;
  JsonArray timers = doc["purgadores"].to<JsonArray>();
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) == pdTRUE) {
    for (int i = 0; i < 2; ++i) {
      const auto state = purgadores[i].state(millis()); JsonObject entry = timers.add<JsonObject>();
      entry["canal"] = i + 1; entry["fechado_min"] = purgadores[i].closedMinutes();
      entry["aberto_s"] = purgadores[i].openSeconds();
      const bool cadArmed = cadPurgeTest.armed(i);
      const bool benchOn=s.bench.mirroring||s.bench.testing;
      entry["ativo"]=benchOn ? true : (cadArmed ? cadPurgeTest.current() : state.active);
      entry["aberto"]=benchOn ? s.bench.outputs[3+i] : (cadArmed ? cadPurgeTest.requestedOpen(i) : state.open);
      entry["comando_aberto"] = benchOn ?
        s.bench.outputs[3+i] :
        (cadArmed ? cadPurgeTest.requestedOpen(i) : (purgeOutputs.armed(i) && state.open));
      entry["restante_ms"]=state.remainingMs;entry["armado_teste_cad"]=s.bench.mirroring;
      entry["saida_fisica_habilitada"]=purgeOutputs.configured();entry["armado_real"]=false; // Build exclusiva de LEDs.
      entry["armado"] = purgeOutputs.armed(i);
      entry["modo"]=s.bench.testing?"TESTE_LED":modo==REMOTO_BANCADA?(benchOn?"TESTE_CAD_LEDS":"SIMULACAO"):
        (purgeOutputs.armed(i) ? "REAL" : (state.active ? "SIMULACAO" : "PARADO"));
      entry["pino_reservado"] = PurgeOutputs::pin(i);
    }
    xSemaphoreGive(mutexEstado);
  }
  jsonResponse(doc);
}
void informacoesCAD() {
  JsonDocument doc; doc["device_id"] = deviceId(); doc["credencial_configurada"] = copiarTokenCAD().length() > 0;
  doc["status"] = int(statusCAD); doc["http"] = int(ultimoHttpCAD); doc["api"] = CAD_BASE; jsonResponse(doc);
}
void configurarCAD() {
  if (!localPostAllowed()) return;
  if (modo != PARADO) { servidor.send(409, "text/plain", "Pare os testes antes de alterar a credencial."); return; }
  String value = servidor.arg("token"); value.trim();
  if (!value.length() || !guardarTokenCAD(value)) { servidor.send(400, "text/plain", "Formato do token invalido."); return; }
  servidor.send(200, "application/json", "{\"ok\":true}");
}
void apagarCredencialCAD() {
  if (!localPostAllowed()) return;
  if (modo != PARADO) { servidor.send(409, "text/plain", "Pare os testes antes de apagar a credencial."); return; }
  if (!guardarTokenCAD("")) { servidor.send(500, "text/plain", "Falha ao apagar."); return; }
  servidor.send(200, "application/json", "{\"ok\":true}");
}
void modoHandler() {
  if (!localPostAllowed()) return;
  const String value = servidor.arg("valor");
  if (value == "real" && !pt100Configurado) { servidor.send(409, "text/plain", "PT100 e pinos nao configurados/validados. Operacao real indisponivel."); return; }
  if (value == "simulacao" && (WiFi.status() != WL_CONNECTED || copiarTokenCAD().isEmpty())) {
    servidor.send(409, "text/plain", "Conecte o Wi-Fi e salve o token CAD."); return;
  }
  Modo next;
  if (value == "real") next = OPERACAO_REAL;
  else if (value == "automatico") next = AUTOMATICO;
  else if (value == "manual") next = MANUAL;
  else if (value == "simulacao") next = REMOTO_BANCADA;
  else if (value == "parado") next = PARADO;
  else { servidor.send(400, "text/plain", "Modo invalido"); return; }
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) { servidor.send(503, "text/plain", "Tente novamente"); return; }
  benchLeds.stop();if(next==REMOTO_BANCADA)benchLeds.selectCad(millis());
  else if(next==AUTOMATICO||next==MANUAL)benchLeds.selectLocal(millis());
  modo=next; corManual=-1; fase=0; inicioFase=millis(); remoteCommand.valid=false; ++remoteCommand.generation;
  for (auto &p : purgadores) p.stop(); purgeOutputs.stopAll(); cadPurgeTest.stopAll(); cgdGate.stop();
  xSemaphoreGive(mutexEstado);
  preferenciasCAD.putString("modo", next == REMOTO_BANCADA ? "simulacao" : "parado");
  // A resposta de mudança será refletida pela tarefa local em até um ciclo.
  servidor.send(200, "application/json", "{\"ok\":true}");
}
void manualHandler() {
  if (!localPostAllowed()) return;
  const String color = servidor.arg("valor"); int8_t index;
  if (color == "vermelho") index = 0; else if (color == "amarelo") index = 1;
  else if (color == "verde") index = 2; else if (color == "nenhum") index = -1;
  else { servidor.send(400, "text/plain", "Cor invalida"); return; }
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) { servidor.send(503, "text/plain", "Tente novamente"); return; }
  if (modo != MANUAL) { xSemaphoreGive(mutexEstado); servidor.send(409, "text/plain", "Selecione modo manual"); return; }
  benchLeds.selectLocal(millis());inicioFase=millis();corManual = index; xSemaphoreGive(mutexEstado); servidor.send(200, "application/json", "{\"ok\":true}");
}
void simularHandler() {
  if (!localPostAllowed()) return;
  const String phase = servidor.arg("valor"); uint8_t value;
  if (phase == "inicio") value = 0; else if (phase == "meio") value = 1;
  else if (phase == "alto") value = 2; else if (phase == "fim") value = 3;
  else { servidor.send(400, "text/plain", "Etapa invalida"); return; }
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) { servidor.send(503, "text/plain", "Tente novamente"); return; }
  benchLeds.selectLocal(millis());modo=SIMULACAO; fase=value; inicioFase=millis(); remoteCommand.valid=false;
  for (auto &p : purgadores) p.stop(); purgeOutputs.stopAll(); cadPurgeTest.stopAll(); cgdGate.stop();
  xSemaphoreGive(mutexEstado); preferenciasCAD.putString("modo", "parado");
  servidor.send(200, "application/json", "{\"ok\":true}");
}
void autorizarRemotoHandler() {
  if (servidor.arg("valor") != "ligar" || modo != PARADO) { servidor.send(409, "text/plain", "Pare os testes antes de autorizar o CAD."); return; }
  // Reutiliza exatamente a validação de origem e de conectividade do modo local.
  if (!localPostAllowed()) return;
  if (WiFi.status() != WL_CONNECTED || copiarTokenCAD().isEmpty()) { servidor.send(409, "text/plain", "Conecte Wi-Fi e token CAD."); return; }
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) { servidor.send(503, "text/plain", "Tente novamente"); return; }
  benchLeds.selectCad(millis());modo=REMOTO_BANCADA; remoteCommand.valid=false; ++remoteCommand.generation;
  for (auto &p : purgadores) p.stop(); purgeOutputs.stopAll(); cadPurgeTest.stopAll(); cgdGate.stop(); xSemaphoreGive(mutexEstado);
  preferenciasCAD.putString("modo", "simulacao"); servidor.send(200, "application/json", "{\"ok\":true}");
}
void purgadoresHandler() {
  if (!localPostAllowed()) return;
  const String channel = servidor.arg("canal"), action = servidor.arg("valor");
  if (channel != "1" && channel != "2") { servidor.send(400, "text/plain", "Canal invalido"); return; }
  const int i = channel.toInt() - 1;
  const String closed = servidor.arg("fechado_min"), opened = servidor.arg("aberto_s");
  auto digits = [](const String &value) { if (!value.length() || value.length() > 6) return false;
    for (size_t i = 0; i < value.length(); ++i) if (value[i] < '0' || value[i] > '9') return false; return true; };
  if (action == "configurar" && (!digits(closed) || !digits(opened))) { servidor.send(400, "text/plain", "Tempos devem ser inteiros validos."); return; }
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) { servidor.send(503, "text/plain", "Tente novamente"); return; }
  bool ok = true;
  if (action == "configurar") { cadPurgeTest.stop(i); purgeOutputs.stop(i); ok = purgadores[i].configure(closed.toInt(), opened.toInt()); }
  else if (action == "iniciar" && modo != OPERACAO_REAL && modo != REMOTO_BANCADA) { cadPurgeTest.stop(i); purgeOutputs.stop(i); purgadores[i].startSimulation(millis()); }
  else if (action == "armar_real" && false /* V12 somente LEDs de bancada */) {
    cadPurgeTest.stop(i); purgadores[i].stop(); ok = purgeOutputs.arm(i);
  }
  else if (action == "iniciar_real" && false /* V12 somente LEDs de bancada */)
    purgadores[i].startSimulation(millis()); // somente o scheduler; driver armado separado.
  else if (action == "armar_teste_cad") {
    // Bloqueado: CAD e simulacao sao visualizacao, nunca acionamento fisico.
    cadPurgeTest.stop(i); purgeOutputs.stop(i); ok = false;
  }
  else if (action == "parar") {
    benchLeds.stop();modo=PARADO;corManual=-1;remoteCommand.valid=false;
    escreverSaidas(false,false,false);purgeOutputs.stopAll();cgdGate.stop();
    cadPurgeTest.stop(i); purgadores[i].stop(); purgeOutputs.stop(i);
  }
  else ok = false;
  xSemaphoreGive(mutexEstado);
  if (!ok) { servidor.send(400, "text/plain", "Comando indisponivel: confira modo, armamento e simulacao CAD atual. Tempos 1-120 min / 1-300 s."); return; }
  if (action == "configurar") {
    preferenciasPurga.putUInt(i == 0 ? "closed1" : "closed2", closed.toInt());
    preferenciasPurga.putUInt(i == 0 ? "open1" : "open2", opened.toInt());
  }
  servidor.send(200, "application/json", "{\"ok\":true}");
}



void bancadaRelesHandler(){
  if(!localPostAllowed())return;
  const String acao=servidor.arg("valor");
  if(acao!="parar"){servidor.send(400,"text/plain","Selecione Simulacao CAD para espelhar; esta rota somente desarma.");return;}
  if(xSemaphoreTake(mutexEstado,pdMS_TO_TICKS(30))!=pdTRUE){servidor.send(503,"text/plain","Ocupado");return;}
  benchLeds.stop();modo=PARADO;corManual=-1;remoteCommand.valid=false;++remoteCommand.generation;
  for(auto &p:purgadores)p.stop();cadPurgeTest.stopAll();
  escreverSaidas(false,false,false);purgeOutputs.stopAll();cgdGate.stop();
  localSnapshot.bench=cgd::BenchState();localSnapshot.red=localSnapshot.yellow=localSnapshot.green=false;
  localSnapshot.mode=PARADO;localSnapshot.signal=cgd::unavailable();
  localSnapshot.previewColor=cgd::Color::DESLIGADO;
  localSnapshot.previewRed=localSnapshot.previewYellow=localSnapshot.previewGreen=false;
  localSnapshot.cadCurrent=false;localSnapshot.cadComplete=false;
  xSemaphoreGive(mutexEstado);
  servidor.send(200,"application/json","{\"ok\":true,\"armado\":false}");
}
void bancadaTesteHandler(){
  if(!localPostAllowed())return;
  const String channel=servidor.arg("canal");
  const char* names[]={"vermelho","amarelo","verde","camisa","eixo","carga_aberta","descarga_aberta"};
  int8_t selected=-1;
  for(int8_t i=0;i<7;i++)if(channel==names[i]){selected=i;break;}
  if(selected<0){servidor.send(400,"text/plain","Canal de LED invalido");return;}
  if(xSemaphoreTake(mutexEstado,pdMS_TO_TICKS(30))!=pdTRUE){servidor.send(503,"text/plain","Ocupado");return;}
  const uint32_t now=millis();
  const bool ok=modo!=OPERACAO_REAL&&benchLeds.startTest(selected,benchInput(now),now);
  // Break before make: the local task applies only the selected LED next tick.
  if(ok){
    modo=PARADO;corManual=-1;remoteCommand.valid=false;++remoteCommand.generation;
    for(auto &p:purgadores)p.stop();cadPurgeTest.stopAll();
    escreverSaidas(false,false,false);purgeOutputs.stopAll();cgdGate.stop();
  }
  xSemaphoreGive(mutexEstado);
  if(!ok){servidor.send(409,"text/plain","Exige placa compativel, fora do PT100 e nenhum teste ativo. Aguarde 1 segundo entre testes.");return;}
  servidor.send(200,"application/json","{\"ok\":true,\"duracao_ms\":2000,\"isolado\":true}");
}
void guilhotinasHandler() {
  if(!localPostAllowed())return;
  const String g=servidor.arg("guilhotina"),a=servidor.arg("acao");
  if((g!="carga"&&g!="descarga")||(a!="abrir"&&a!="fechar")){
    servidor.send(400,"text/plain","Guilhotina ou acao invalida");return;
  }
  if(xSemaphoreTake(mutexEstado,pdMS_TO_TICKS(20))!=pdTRUE){
    servidor.send(503,"text/plain","Controlador ocupado");return;
  }
  const bool ok=false; // Proibe pulso local de cilindros em build de bancada.
  xSemaphoreGive(mutexEstado);
  if(!ok){
    servidor.send(409,"text/plain",
      "Comando bloqueado: habilite na compilacao, chave GPIO27, modo PARADO, intervalo entre pulsos.");
    return;
  }
  JsonDocument d;d["ok"]=true;d["resultado"]="PULSO_SOLICITADO_SEM_RETORNO";
  jsonResponse(d);
}

void comecarConexao(const String &ssid, const String &senha, bool guardar) {
  if (ssid.length() == 0) return;
  wifiPendenteNome = ssid;
  wifiPendenteSenha = senha;
  salvarAposConectar = guardar;
  wifiTentando = true;
  inicioWifi = millis();
  mensagemWifi = "Tentando conectar a " + ssid;
  WiFi.disconnect(false, false);  // Desliga apenas o cliente; AP continua ligado.
  WiFi.begin(ssid.c_str(), senha.c_str());
  Serial.printf("Tentando rede 2,4 GHz: %s\n", ssid.c_str());
}

void acompanharWifi() {
  if (wifiTentando) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiTentando = false;
      mensagemWifi = "Conectado a " + WiFi.SSID();
      if (salvarAposConectar) {
        preferencias.putString("ssid", wifiPendenteNome);
        preferencias.putString("senha", wifiPendenteSenha);
        wifiSalvoNome = wifiPendenteNome;
        wifiSalvoSenha = wifiPendenteSenha;
      }
      wifiPendenteSenha = "";
      salvarAposConectar = false;
      Serial.print("WIFI CONECTADO! IP DA CASA: http://");
      Serial.println(WiFi.localIP());
    } else if (millis() - inicioWifi >= LIMITE_WIFI_MS) {
      wifiTentando = false;
      salvarAposConectar = false;
      wifiPendenteSenha = "";
      mensagemWifi = "Falhou. Confira senha, sinal e rede 2,4 GHz. A rede do ESP32 continua disponivel.";
      WiFi.disconnect(false, false);
      ultimaTentativaSalva = millis();
      Serial.println("Wi-Fi nao conectou. Acesse o ESP32 em http://192.168.4.1");
    }
  } else if (WiFi.status() != WL_CONNECTED && wifiSalvoNome.length() &&
             millis() - ultimaTentativaSalva >= NOVA_TENTATIVA_MS) {
    ultimaTentativaSalva = millis();
    comecarConexao(wifiSalvoNome, wifiSalvoSenha, false);
  }
}

bool wifiNaCasa() {
  return WiFi.status() == WL_CONNECTED;
}

void iniciarRede() {
  Serial.println("CAMPO DO GADO - DIGESTOR 1 - PORTAL WI-FI");
  preferencias.begin("wifi-digestor", false);
  wifiSalvoNome = preferencias.getString("ssid", "");
  wifiSalvoSenha = preferencias.getString("senha", "");

  WiFi.persistent(false);
  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(false); // Reconexao controlada pela nossa rotina
  WiFi.softAPConfig(IPAddress(192,168,4,1), IPAddress(192,168,4,1), IPAddress(255,255,255,0));
  if (WiFi.softAP(REDE_ESP32_NOME, REDE_ESP32_SENHA, 1, false, 4)) {
    Serial.printf("REDE PROPRIA: %s\n", REDE_ESP32_NOME);
    Serial.printf("ABRA: http://%s\n", WiFi.softAPIP().toString().c_str());
  } else {
    Serial.println("ERRO: nao foi possivel ativar o ponto de acesso.");
  }
  ultimaTentativaSalva = millis();
  if (wifiSalvoNome.length()) {
    comecarConexao(wifiSalvoNome, wifiSalvoSenha, false);
  } else {
    mensagemWifi = "Sem rede salva. Escolha o Wi-Fi pelo celular.";
  }
}

void escanearWifiHandler() {
  if (wifiTentando) {
    servidor.send(409, "text/plain", "Aguarde terminar a tentativa de conexao.");
    return;
  }
  int16_t n = WiFi.scanComplete();
  if (n == WIFI_SCAN_FAILED) {
    WiFi.scanNetworks(true, true); // Busca assincrona, inclui redes ocultas
    servidor.send(202, "application/json", "{\"situacao\":\"procurando\"}");
    return;
  }
  if (n == WIFI_SCAN_RUNNING) {
    servidor.send(202, "application/json", "{\"situacao\":\"procurando\"}");
    return;
  }
  String json = "{\"redes\":[";
  const int quantidade = n < 25 ? n : 25;
  for (int i = 0; i < quantidade; ++i) {
    if (i) json += ',';
    json += "{\"ssid\":\""; json += escaparJSON(WiFi.SSID(i));
    json += "\",\"rssi\":"; json += String(WiFi.RSSI(i));
    json += ",\"protegida\":";
    json += (WiFi.encryptionType(i) == WIFI_AUTH_OPEN) ? "false" : "true";
    json += '}';
  }
  json += "]}";
  WiFi.scanDelete();
  servidor.sendHeader("Cache-Control", "no-store");
  servidor.send(200, "application/json", json);
}

void conectarWifiHandler() {
  if (!localPostAllowed()) return;
  if (wifiTentando) {
    servidor.send(409, "text/plain", "Aguarde: tentativa de conexao em andamento.");
    return;
  }
  String ssid = servidor.arg("ssid"); ssid.trim();
  String senha = servidor.arg("senha");
  if (!ssid.length() || ssid.length() > 32 || senha.length() > 63 || (senha.length() > 0 && senha.length() < 8)) {
    servidor.send(400, "text/plain", "SSID ou senha invalidos. Wi-Fi WPA2 usa senha de 8 a 63 caracteres; rede aberta pode ficar em branco.");
    return;
  }
  ultimaTentativaSalva = millis();
  comecarConexao(ssid, senha, true);
  servidor.send(202, "application/json", "{\"situacao\":\"conectando\"}");
}

void apagarWifiHandler() {
  if (!localPostAllowed()) return;
  wifiTentando = false;
  salvarAposConectar = false;
  wifiSalvoNome = "";
  wifiSalvoSenha = "";
  wifiPendenteNome = "";
  wifiPendenteSenha = "";
  preferencias.remove("ssid");
  preferencias.remove("senha");
  WiFi.disconnect(false, false); // Nao apaga o AP; pode desligar temporariamente o acesso LAN.
  mensagemWifi = "Rede salva removida. Acesse pelo AP 192.168.4.1.";
  servidor.send(200, "application/json", "{\"situacao\":\"apagada\"}");
}


void setup() {
#if defined(CONFIG_IDF_TARGET_ESP32)
  benchPinsCompatible=true; // ESP32 classico; GPIO16/17 nao sao configurados.
#else
  benchPinsCompatible=false; // Outra familia exige validar a pinagem.
#endif
  digitalWrite(PINO_R, RELE_DESLIGA); digitalWrite(PINO_A, RELE_DESLIGA); digitalWrite(PINO_V, RELE_DESLIGA);
  pinMode(PINO_R, OUTPUT); pinMode(PINO_A, OUTPUT); pinMode(PINO_V, OUTPUT);
  escreverSaidas(false, false, false); purgeOutputs.begin(); cgdGate.begin(); Serial.begin(115200);
  mutexEstado = xSemaphoreCreateMutex(); mutexCredencial = xSemaphoreCreateMutex();
  if (!mutexEstado || !mutexCredencial) { Serial.println("Falha de memoria: saidas desligadas"); return; }
  preferenciasCAD.begin("cad-esp32", false); tokenCAD = preferenciasCAD.getString("token", "");
  preferenciasPurga.begin("purga-sim", false);
  for (int i = 0; i < 2; ++i) purgadores[i].configure(
    preferenciasPurga.getUInt(i == 0 ? "closed1" : "closed2", i == 0 ? 5 : 10),
    preferenciasPurga.getUInt(i == 0 ? "open1" : "open2", 60));
  // V12 nunca restaura autorizacao nem modo de saida depois de reiniciar.
  modo=PARADO;benchLeds.stop();
  pt100.begin(); pt100Configurado = pt100.configured();
  iniciarRede();
  const char *headers[] = {"Origin", "X-CGD-Local"}; servidor.collectHeaders(headers, 2);
  servidor.on("/", HTTP_GET, []() { servidor.sendHeader("Cache-Control", "no-store"); servidor.send_P(200, "text/html; charset=utf-8", LOCAL_UI); });
  servidor.on("/api/estado", HTTP_GET, enviarEstado);
  servidor.on("/api/status", HTTP_GET, enviarEstado);
  servidor.on("/api/modo", HTTP_POST, modoHandler);
  servidor.on("/api/manual", HTTP_POST, manualHandler);
  servidor.on("/api/simular", HTTP_POST, simularHandler);
  servidor.on("/api/remoto", HTTP_POST, autorizarRemotoHandler);
  servidor.on("/api/purgadores", HTTP_POST, purgadoresHandler);
  servidor.on("/api/guilhotinas", HTTP_POST, guilhotinasHandler);
  servidor.on("/api/bancada/reles", HTTP_POST, bancadaRelesHandler);
  servidor.on("/api/bancada/teste", HTTP_POST, bancadaTesteHandler);
  servidor.on("/api/wifi/scan", HTTP_GET, escanearWifiHandler);
  servidor.on("/api/wifi/conectar", HTTP_POST, conectarWifiHandler);
  servidor.on("/api/wifi/apagar", HTTP_POST, apagarWifiHandler);
  servidor.on("/api/cad/status", HTTP_GET, informacoesCAD);
  servidor.on("/api/cad/token", HTTP_POST, configurarCAD);
  servidor.on("/api/cad/apagar", HTTP_POST, apagarCredencialCAD);
  servidor.onNotFound([]() { servidor.send(404, "text/plain", "Pagina nao encontrada"); });
  servidor.begin();
  xTaskCreatePinnedToCore(tarefaSinalizacao, "local_signals", 6144, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(tarefaCAD, "cad_https", 12288, nullptr, 1, nullptr, 0);
  Serial.println("IHM pronta: http://192.168.4.1 · R3: sete GPIOs de bancada, chave GPIO27 opcional");
}
void loop() {
  if (!mutexEstado || !mutexCredencial) { delay(10); return; }
  servidor.handleClient(); acompanharWifi(); delay(1);
}
