#pragma once
#include <Arduino.h>
#include <SPI.h>
#include "hardware_config.h"
#include "temperature_logic.h"

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
