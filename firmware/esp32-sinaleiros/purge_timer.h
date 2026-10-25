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
