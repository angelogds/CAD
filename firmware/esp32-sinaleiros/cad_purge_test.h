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
