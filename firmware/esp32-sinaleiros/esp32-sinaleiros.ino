/*
  CAMPO DO GADO · 2A Automação Industrial · ESP32-D0WD-V3 / ESP32 Dev Module
  Evolução do sketch bancada-v7 fornecido pelo responsável.
  Três sinaleiros ativos LOW; PT100 opt-in; purgadores LOW/fecha-sem-energia confirmados pelo responsável.
  NVS Wi-Fi/token preservada. Purga exige Armar+Iniciar local. Nenhum comando de comporta/descarga de material.
*/
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
#include "temperature_logic.h"
#include "purge_timer.h"
#include "purge_outputs.h"
#include "cad_purge_test.h"
#include "cad_simulation_json.h"
#include "pt100_max31865.h"
#include "local_ui.h"

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
const char *CAD_FIRMWARE = "temperatura-v9";
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
  bool purgeOpen[2] = {false, false};
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
  uint32_t sampledAt = 0, updatedAt = 0;
  int32_t version = -1;
  int8_t receivedPhase = -1;
  bool red = false, yellow = false, green = false;
  bool cadCurrent = false, cadExpired = false, cadComplete = false, heating = false;
  bool purgeVirtualOpen[2] = {false, false};
} localSnapshot;
cgd::PurgeTimer purgadores[2] = { cgd::PurgeTimer(5, 60), cgd::PurgeTimer(10, 60) };
PurgeOutputs purgeOutputs;
cgd::CadPurgeTest cadPurgeTest;
Pt100Reader pt100;
bool pt100Configurado = false;

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
    copy.cadCurrent = false; copy.cadComplete = false; copy.heating = false;
    copy.purgeVirtualOpen[0] = copy.purgeVirtualOpen[1] = false;
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
        for (auto &p : purgadores) p.fault(); purgeOutputs.stopAll(); cadPurgeTest.stopAll(); synchronizationFault = false;
      }
      LocalSnapshot next; next.updatedAt = now;
      next.mode = modo;
      if (previousMode != modo) { lastCommand = UINT32_MAX; previousMode = modo; localSimulation.stopSimulation(); }
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
          next.cadCurrent = true; next.cadComplete = remoteCommand.completeState;
          next.heating = remoteCommand.heating;
          next.purgeVirtualOpen[0] = remoteCommand.purgeOpen[0]; next.purgeVirtualOpen[1] = remoteCommand.purgeOpen[1];
        } else next.cadExpired = remoteCommand.everReceived;
      } else if (modo == AUTOMATICO || modo == SIMULACAO) {
        uint32_t elapsed = now - inicioFase;
        if (elapsed >= DURACAO_FASE_MS) {
          if (modo == AUTOMATICO && fase < 3) { ++fase; inicioFase = now; }
          else { modo = PARADO; next.mode = PARADO; for (auto &p : purgadores) p.stop(); purgeOutputs.stopAll(); cadPurgeTest.stopAll(); }
        }
        if (modo == AUTOMATICO || modo == SIMULACAO) {
          const float values[] = {25, 75, 110, 125};
          next.signal = cgd::classify(values[fase]); next.sampledAt = now;
        }
      }
      cgd::Pins pins = cgd::requestedPins(next.signal, now, true);
      if (modo == MANUAL) {
        pins = {corManual == 2, corManual == 1, corManual == 0};
        next.signal.color = corManual == 0 ? cgd::Color::VERMELHO :
          (corManual == 1 ? cgd::Color::AMARELO : (corManual == 2 ? cgd::Color::VERDE : cgd::Color::DESLIGADO));
      }
      if (modo == PARADO) pins = {false, false, false};
      escreverSaidas(pins.red, pins.yellow, pins.green);
      next.red = pins.red; next.yellow = pins.yellow; next.green = pins.green;
      localSnapshot = next;
      cadPurgeTest.update(modo == REMOTO_BANCADA, WiFi.status() == WL_CONNECTED,
        remoteCommand.valid && remoteCommand.completeState, now, remoteCommand.receivedAt,
        remoteCommand.validity, remoteCommand.purgeOpen[0], remoteCommand.purgeOpen[1]);
      // Driver físico separado: teste CAD exige armamento LOCAL e pacote completo fresco.
      for (int i = 0; i < 2; ++i) {
        if (modo == REMOTO_BANCADA) {
          purgadores[i].stop();
          if (!cadPurgeTest.armed(i)) purgeOutputs.stop(i);
          purgeOutputs.apply(i, cadPurgeTest.requestedOpen(i), cadPurgeTest.current());
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
        purgeOutputs.apply(i, timer.active && timer.open, healthy);
      }
      xSemaphoreGive(mutexEstado);
    } else {
      // Falha de sincronização não retém lâmpada/válvula ligada. Latch exige novo armamento.
      escreverSaidas(false, false, false); purgeOutputs.forceOff(); synchronizationFault = true;
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
  JsonDocument doc; doc["device_id"] = deviceId(); doc["digestor_id"] = DIGESTOR_ID;
  doc["fase"] = cgd::phase(s.signal);
  if (s.mode != MANUAL) doc["fase_aplicada"] = cgd::phase(s.signal);
  if (s.mode == REMOTO_BANCADA) {
    doc["fase_recebida"] = s.receivedPhase == 0 ? "INICIO" :
      (s.receivedPhase == 1 ? "MEIO" : (s.receivedPhase == 2 ? "FINAL" : "PARADO"));
    if (s.version >= 0) doc["versao_fase"] = s.version;
  }
  if (s.mode == MANUAL) {
    LocalSnapshot stopped = s; stopped.signal = cgd::unavailable(cgd::SensorStatus::SEM_SENSOR);
    preencherSinal(doc, stopped);
  } else preencherSinal(doc, s);
  doc["firmware"] = CAD_FIRMWARE; doc["uptime_s"] = millis() / 1000;
  doc["wifi_rssi"] = WiFi.RSSI();
  // GPIO comandado não comprova retorno elétrico: nunca enviar saida_confirmada.
  String out; serializeJson(doc, out); return out;
}
bool receberSimulacaoCAD(const String &body) {
  cgd::CadSimulationCommand command;
  if (!cgd::parseCadSimulationJson(body.c_str(), body.length(), DIGESTOR_ID, command)) return false;
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) return false;
  if (modo == REMOTO_BANCADA) {
    remoteCommand.valid = command.active; remoteCommand.everReceived = command.active;
    remoteCommand.completeState = command.active && command.completeState;
    remoteCommand.heating = command.heating;
    remoteCommand.purgeOpen[0] = command.purgeOpen[0]; remoteCommand.purgeOpen[1] = command.purgeOpen[1];
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
  doc["restante_ms"] = (s.mode == AUTOMATICO || s.mode == SIMULACAO) ?
    (millis() - inicioFase < DURACAO_FASE_MS ? DURACAO_FASE_MS - (millis() - inicioFase) : 0) : 0;
  doc["remoto_restante_s"] = 0; doc["simulacao_persistente"] = s.mode == REMOTO_BANCADA;
  preencherSinal(doc, s, true); doc["pt100_habilitado"] = pt100Configurado;
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
      entry["ativo"] = cadArmed ? cadPurgeTest.current() : state.active;
      entry["aberto"] = cadArmed ? cadPurgeTest.requestedOpen(i) : state.open;
      entry["comando_aberto"] = cadArmed ? cadPurgeTest.requestedOpen(i) : (purgeOutputs.armed(i) && state.open);
      entry["restante_ms"] = state.remainingMs; entry["armado_teste_cad"] = cadArmed;
      entry["saida_fisica_habilitada"] = purgeOutputs.configured(); entry["armado_real"] = purgeOutputs.armed(i);
      entry["armado"] = purgeOutputs.armed(i);
      entry["modo"] = cadArmed ? "TESTE_CAD" : (purgeOutputs.armed(i) ? "REAL" : (state.active ? "SIMULACAO" : "PARADO"));
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
  modo = next; corManual = -1; fase = 0; inicioFase = millis(); remoteCommand.valid = false; ++remoteCommand.generation;
  for (auto &p : purgadores) p.stop(); purgeOutputs.stopAll(); cadPurgeTest.stopAll();
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
  corManual = index; xSemaphoreGive(mutexEstado); servidor.send(200, "application/json", "{\"ok\":true}");
}
void simularHandler() {
  if (!localPostAllowed()) return;
  const String phase = servidor.arg("valor"); uint8_t value;
  if (phase == "inicio") value = 0; else if (phase == "meio") value = 1;
  else if (phase == "alto") value = 2; else if (phase == "fim") value = 3;
  else { servidor.send(400, "text/plain", "Etapa invalida"); return; }
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) { servidor.send(503, "text/plain", "Tente novamente"); return; }
  modo = SIMULACAO; fase = value; inicioFase = millis(); remoteCommand.valid = false;
  for (auto &p : purgadores) p.stop(); purgeOutputs.stopAll(); cadPurgeTest.stopAll();
  xSemaphoreGive(mutexEstado); preferenciasCAD.putString("modo", "parado");
  servidor.send(200, "application/json", "{\"ok\":true}");
}
void autorizarRemotoHandler() {
  if (servidor.arg("valor") != "ligar" || modo != PARADO) { servidor.send(409, "text/plain", "Pare os testes antes de autorizar o CAD."); return; }
  // Reutiliza exatamente a validação de origem e de conectividade do modo local.
  if (!localPostAllowed()) return;
  if (WiFi.status() != WL_CONNECTED || copiarTokenCAD().isEmpty()) { servidor.send(409, "text/plain", "Conecte Wi-Fi e token CAD."); return; }
  if (xSemaphoreTake(mutexEstado, pdMS_TO_TICKS(20)) != pdTRUE) { servidor.send(503, "text/plain", "Tente novamente"); return; }
  modo = REMOTO_BANCADA; remoteCommand.valid = false; ++remoteCommand.generation;
  for (auto &p : purgadores) p.stop(); purgeOutputs.stopAll(); cadPurgeTest.stopAll(); xSemaphoreGive(mutexEstado);
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
  else if (action == "armar_real" && (modo == PARADO || (modo == OPERACAO_REAL && localSnapshot.signal.hasTemperature)) && purgeOutputs.configured()) {
    cadPurgeTest.stop(i); purgadores[i].stop(); ok = purgeOutputs.arm(i);
  }
  else if (action == "iniciar_real" && (modo == PARADO || (modo == OPERACAO_REAL && localSnapshot.signal.hasTemperature)) && purgeOutputs.armed(i))
    purgadores[i].startSimulation(millis()); // somente o scheduler; driver armado separado.
  else if (action == "armar_teste_cad" && modo == REMOTO_BANCADA && purgeOutputs.configured()) {
    cadPurgeTest.update(true, WiFi.status() == WL_CONNECTED, remoteCommand.valid && remoteCommand.completeState,
      millis(), remoteCommand.receivedAt, remoteCommand.validity, remoteCommand.purgeOpen[0], remoteCommand.purgeOpen[1]);
    ok = cadPurgeTest.arm(i);
    if (ok) { purgadores[i].stop(); ok = purgeOutputs.arm(i); }
    if (!ok) { cadPurgeTest.stop(i); purgeOutputs.stop(i); }
  }
  else if (action == "parar") { cadPurgeTest.stop(i); purgadores[i].stop(); purgeOutputs.stop(i); }
  else ok = false;
  xSemaphoreGive(mutexEstado);
  if (!ok) { servidor.send(400, "text/plain", "Comando indisponivel: confira modo, armamento e simulacao CAD atual. Tempos 1-120 min / 1-300 s."); return; }
  if (action == "configurar") {
    preferenciasPurga.putUInt(i == 0 ? "closed1" : "closed2", closed.toInt());
    preferenciasPurga.putUInt(i == 0 ? "open1" : "open2", opened.toInt());
  }
  servidor.send(200, "application/json", "{\"ok\":true}");
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
  digitalWrite(PINO_R, RELE_DESLIGA); digitalWrite(PINO_A, RELE_DESLIGA); digitalWrite(PINO_V, RELE_DESLIGA);
  pinMode(PINO_R, OUTPUT); pinMode(PINO_A, OUTPUT); pinMode(PINO_V, OUTPUT);
  escreverSaidas(false, false, false); purgeOutputs.begin(); Serial.begin(115200);
  mutexEstado = xSemaphoreCreateMutex(); mutexCredencial = xSemaphoreCreateMutex();
  if (!mutexEstado || !mutexCredencial) { Serial.println("Falha de memoria: saidas desligadas"); return; }
  preferenciasCAD.begin("cad-esp32", false); tokenCAD = preferenciasCAD.getString("token", "");
  preferenciasPurga.begin("purga-sim", false);
  for (int i = 0; i < 2; ++i) purgadores[i].configure(
    preferenciasPurga.getUInt(i == 0 ? "closed1" : "closed2", i == 0 ? 5 : 10),
    preferenciasPurga.getUInt(i == 0 ? "open1" : "open2", 60));
  // Somente a seleção SIMULAÇÃO é restaurada. GPIOs aguardam um comando novo válido.
  if (preferenciasCAD.getString("modo", "parado") == "simulacao") modo = REMOTO_BANCADA;
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
  Serial.println("IHM pronta: http://192.168.4.1 · purgadores aguardam Armar + Iniciar local");
}
void loop() {
  if (!mutexEstado || !mutexCredencial) { delay(10); return; }
  servidor.handleClient(); acompanharWifi(); delay(1);
}
