#pragma once
#include <ArduinoJson.h>
#include "cad_simulation_protocol.h"
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
