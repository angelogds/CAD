/*
 * CAMPO DO GADO - IHM - DIGESTOR 1 - TESTE GPIO2 / Wi-Fi
 * Placa: ESP32 Dev Module (ESP32-D0WD-V3)
 *
 * PROVA DE COMUNICACAO SOMENTE LEITURA!
 * Nao aciona reles, valvulas, sinaleiros 220 V ou atuadores.
 *
 * IMPORTANTE: NUNCA envie este arquivo preenchido com senhas ao GitHub.
 */
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#define LED_TESTE 2

const char* WIFI_NOME = "PREENCHA_NOME_WIFI";
const char* WIFI_SENHA = "PREENCHA_SENHA_WIFI";
const char* TOKEN_IHM  = "PREENCHA_TOKEN_GERADO_NO_RAILWAY";

const char* URL_IHM = "https://manutencao.campodogado.app.br/automacao/api/esp32/telemetria";

// Raiz Let's Encrypt ISRG Root X1. Valida TLS quando o dominio usa esta cadeia.
// Se seu DNS usa proxy Cloudflare/outro emissor, confirme a CA e atualize este PEM.
const char* CERTIFICADO_RAIZ = R"ESP_PEM(
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
)ESP_PEM";

bool ledLigado = false;
unsigned long ultimaTroca = 0;
unsigned long ultimaTentativaWifi = 0;

void enviarEstado() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Sem Wi-Fi; LED continua piscando localmente.");
    return;
  }
  if (time(nullptr) < 1760000000) {
    Serial.println("Aguardando sincronizacao de horario para validar HTTPS...");
    return;
  }
  WiFiClientSecure cliente;
  cliente.setCACert(CERTIFICADO_RAIZ); // nunca usar setInsecure() com TOKEN
  cliente.setTimeout(5000);

  HTTPClient http;
  http.setTimeout(5000);
  if (!http.begin(cliente, URL_IHM)) {
    Serial.println("Nao foi possivel iniciar HTTPS.");
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + TOKEN_IHM);
  String corpo = String("{\"device_id\":\"digestor-1\",\"gpio2\":")
    + (ledLigado ? "true" : "false") + "}";
  int codigo = http.POST(corpo);
  Serial.printf("GPIO2=%s | HTTP=%d\n", ledLigado ? "LIGADO" : "DESLIGADO", codigo);
  if (codigo < 0) Serial.println(http.errorToString(codigo));
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_TESTE, OUTPUT);
  digitalWrite(LED_TESTE, LOW);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_NOME, WIFI_SENHA);
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.println("CAMPO DO GADO | ESP32 D1 | Teste Wi-Fi da IHM");
}

void loop() {
  unsigned long agora = millis();
  if (WiFi.status() != WL_CONNECTED && agora - ultimaTentativaWifi >= 10000) {
    ultimaTentativaWifi = agora;
    WiFi.reconnect();
    Serial.println("Tentando conectar ao Wi-Fi...");
  }
  if (agora - ultimaTroca >= 1000) {
    ultimaTroca = agora;
    ledLigado = !ledLigado;
    digitalWrite(LED_TESTE, ledLigado ? HIGH : LOW);
    enviarEstado();
  }
}
