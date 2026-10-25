#include "../cad_purge_test.h"
#include <assert.h>
#include <initializer_list>
#include <stdint.h>
#include <stdio.h>

using namespace cgd;
int main() {
  CadPurgeTest gate;
  assert(!gate.current());
  assert(!gate.arm(0) && !gate.arm(1));
  assert(!gate.requestedOpen(0) && !gate.requestedOpen(1));

  assert(gate.update(true, true, true, 100, 100, 6500, true, true));
  assert(gate.current());
  assert(!gate.armed(0) && !gate.armed(1));
  assert(!gate.requestedOpen(0) && !gate.requestedOpen(1)); // No packet can auto-arm.
  assert(gate.arm(0));
  assert(gate.requestedOpen(0) && !gate.requestedOpen(1));
  assert(gate.arm(1));
  assert(gate.requestedOpen(0) && gate.requestedOpen(1));

  // Fresh consecutive commands keep local authorization, independently of level.
  assert(gate.update(true, true, true, 200, 200, 6500, false, true));
  assert(gate.armed(0) && gate.armed(1));
  assert(!gate.requestedOpen(0) && gate.requestedOpen(1));
  gate.stop(1);
  assert(gate.armed(0) && !gate.armed(1));
  assert(!gate.requestedOpen(1));
  assert(gate.update(true, true, true, 300, 300, 6500, true, true));
  assert(gate.requestedOpen(0) && !gate.requestedOpen(1));

  const auto assertOff = [&]() {
    assert(!gate.current());
    assert(!gate.armed(0) && !gate.armed(1));
    assert(!gate.requestedOpen(0) && !gate.requestedOpen(1));
    assert(!gate.arm(0) && !gate.arm(1));
  };
  assert(!gate.update(true, false, true, 400, 300, 6500, true, true));
  assertOff(); // Wi-Fi loss closes and disarms immediately.
  assert(gate.update(true, true, true, 500, 500, 6500, true, true));
  assert(!gate.armed(0) && !gate.armed(1)); // Reconnect requires another local action.
  assert(gate.arm(0) && gate.arm(1));
  assert(!gate.update(false, true, true, 600, 500, 6500, true, true));
  assertOff(); // REAL or another non-CAD mode cannot accept this test source.
  assert(gate.update(true, true, true, 700, 700, 6500, true, true));
  assert(gate.arm(0));
  assert(!gate.update(true, true, false, 701, 700, 6500, true, true));
  assertOff(); // A malformed/rejected command cannot retain previous arming.

  for (uint32_t invalid : {0U, 6501U, UINT32_MAX}) {
    assert(!gate.update(true, true, true, 1000, 1000, invalid, true, true));
    assertOff();
  }
  assert(gate.update(true, true, true, 1000, 1000, 6500, true, false));
  assert(gate.arm(0));
  for (uint32_t now = 2000; now <= 7000; now += 1000)
    assert(gate.update(true, true, true, now, 1000, 6500, true, false));
  assert(gate.update(true, true, true, 7500, 1000, 6500, true, false));
  assert(gate.requestedOpen(0)); // Exact maximum deadline is still within validity.
  assert(!gate.update(true, true, true, 7501, 1000, 6500, true, false));
  assertOff();
  assert(!gate.update(true, true, true, 999, 1000, 6500, true, true));
  assertOff(); // A future timestamp is not a fresh packet.

  // A newly received packet after a scheduler gap cannot resurrect the old arm.
  assert(gate.update(true, true, true, 10000, 10000, 100, true, true));
  assert(gate.arm(0) && gate.arm(1));
  assert(gate.update(true, true, true, 10200, 10200, 6500, true, true));
  assert(gate.current() && !gate.armed(0) && !gate.armed(1));
  assert(!gate.requestedOpen(0) && !gate.requestedOpen(1));
  assert(gate.arm(1));
  assert(gate.update(true, true, true, 10300, 10300, 6500, true, false));
  assert(gate.armed(1) && !gate.requestedOpen(1));
  gate.stopAll();
  assert(gate.current() && !gate.armed(0) && !gate.armed(1));
  assert(gate.update(true, true, true, 10400, 10400, 6500, true, true));
  assert(!gate.requestedOpen(0) && !gate.requestedOpen(1));

  for (int invalid : {-100, -1, 2, 100}) {
    assert(!gate.arm(invalid) && !gate.armed(invalid) && !gate.requestedOpen(invalid));
    gate.stop(invalid);
  }

  // Even a still-valid packet, refreshed by the network core, cannot retain
  // authorization after the local application task stops servicing for >2s.
  assert(gate.update(true,true,true,20000,20000,6500,true,true));
  assert(gate.arm(0) && gate.arm(1));
  assert(gate.update(true,true,true,22001,22001,6500,true,true));
  assert(gate.current() && !gate.armed(0) && !gate.armed(1));
  assert(!gate.requestedOpen(0) && !gate.requestedOpen(1));

  // Unsigned time arithmetic supports millis() rollover.
  CadPurgeTest wrapped;
  const uint32_t received = UINT32_MAX - 10U;
  assert(wrapped.update(true, true, true, received, received, 500, true, true));
  assert(wrapped.arm(0));
  assert(wrapped.update(true, true, true, 0, received, 500, true, true));
  assert(wrapped.requestedOpen(0));
  assert(!wrapped.update(true, true, true, 500, received, 500, true, true));
  assert(!wrapped.current() && !wrapped.armed(0) && !wrapped.requestedOpen(0));
  assert(wrapped.update(true, true, true, 600, 600, 500, true, true));
  assert(!wrapped.armed(0) && !wrapped.armed(1));
  puts("cad_purge_test: explicit local arm, freshness, independent requests, invalidation and rollover passed");
}
