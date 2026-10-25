#include "../purge_timer.h"
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <initializer_list>

using namespace cgd;

static PurgeTimer::State advance(PurgeTimer& timer, uint32_t from, uint32_t duration) {
  // Service as loop() would: no blocking delay across an entire interval.
  const uint32_t step = 1000U;
  PurgeTimer::State result = timer.state(from);
  while (duration >= step) {
    from += step;
    result = timer.tick(from);
    duration -= step;
  }
  if (duration) result = timer.tick(from + duration);
  return result;
}

int main() {
  PurgeTimer one; // Default 5 min closed, 60 s open, stopped.
  auto state = one.state(0);
  assert(!state.active && !state.open && !state.physicalOutputEnabled);
  assert(one.closedMinutes() == 5 && one.openSeconds() == 60);
  one.startSimulation(0);
  state = advance(one, 0, 299999);
  assert(state.active && !state.open && state.remainingMs == 1);
  state = one.tick(300000);
  assert(state.active && state.open && state.remainingMs == 60000);
  assert(!state.physicalOutputEnabled); // Even an "open" simulation cannot enable hardware.
  state = advance(one, 300000, 59999);
  assert(state.open && state.remainingMs == 1);
  state = one.tick(360000);
  assert(state.active && !state.open && state.remainingMs == 300000);

  // Independent channels keep their own clocks and configurations.
  PurgeTimer two(10, 30);
  one.startSimulation(0);
  two.startSimulation(0);
  for (uint32_t now = 1000; now <= 300000; now += 1000) {
    one.tick(now);
    two.tick(now);
  }
  assert(one.state(300000).open);
  assert(!two.state(300000).open && two.state(300000).remainingMs == 300000);
  one.stop();
  assert(!one.state(300000).active && !one.state(300000).open);
  state = advance(two, 300000, 300000);
  assert(state.active && state.open && state.remainingMs == 30000);
  two.fault();
  assert(!two.state(600000).open && !two.state(600000).active);

  // Editing timings stops a running channel and requires a new start.
  one.startSimulation(10);
  assert(one.configure(10, 45));
  assert(!one.state(10).active);
  assert(one.closedMinutes() == 10 && one.openSeconds() == 45);
  for (auto invalid : {0U, 121U, UINT32_MAX}) {
    assert(!one.configure(invalid, 60));
    assert(one.closedMinutes() == 10 && one.openSeconds() == 45);
  }
  for (auto invalid : {0U, 301U, UINT32_MAX}) {
    assert(!one.configure(5, invalid));
    assert(one.closedMinutes() == 10 && one.openSeconds() == 45);
  }
  assert(one.configure(1, 1));
  one.startSimulation(0);
  assert(advance(one, 0, 60000).open);
  assert(!one.tick(61000).open);
  assert(one.configure(120, 300));
  one.startSimulation(0);
  assert(advance(one, 0, 120U * 60000U).remainingMs == 300000);

  // A scheduling stall closes the logical channel; no catch-up pulses.
  one.startSimulation(0);
  state = one.tick(3000);
  assert(!state.active && !state.open && !state.physicalOutputEnabled);
  one.configure(1, 60);
  one.startSimulation(0);
  assert(advance(one, 0, 60000).open);
  state = one.state(62001); // Status must not report stale "open" either.
  assert(!state.active && !state.open);
  state = one.tick(62001);
  assert(!state.active && !state.open);
  assert(!one.tick(62002).active);

  // millis() rollover preserves a live timer at normal servicing cadence.
  const uint32_t start = UINT32_MAX - 30000U;
  one.startSimulation(start);
  state = advance(one, start, 59999);
  assert(state.active && !state.open && state.remainingMs == 1);
  state = one.tick(start + 60000U);
  assert(state.active && state.open && state.remainingMs == 60000);
  state = advance(one, start + 60000U, 60000);
  assert(state.active && !state.open && state.remainingMs == 60000);
  puts("purge_timer: simulation-only timing, safe stop/stall, independent channels and rollover passed");
}
