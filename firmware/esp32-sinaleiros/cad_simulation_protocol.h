#pragma once
#include <stdint.h>
#include <string.h>
#include "temperature_logic.h"

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
