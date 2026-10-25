#pragma once
#include <Arduino.h>
#include "hardware_config.h"

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
