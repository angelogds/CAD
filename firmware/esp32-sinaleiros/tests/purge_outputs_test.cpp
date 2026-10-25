#include "purge_outputs.h"
#include "purge_timer.h"
#include "cad_purge_test.h"
#include <assert.h>
#include <stdio.h>
#include <vector>

struct Event { bool write; int pin; int value; };
static std::vector<Event> events;
static int levels[40];
void digitalWrite(int pin, int value) {
  assert(pin == 25 || pin == 26);
  assert(value == LOW || value == HIGH);
  levels[pin] = value;
  events.push_back({true, pin, value});
}
void pinMode(int pin, int value) {
  assert(pin == 25 || pin == 26);
  events.push_back({false, pin, value});
}

int main() {
  for (int &level : levels) level = -1;
  PurgeOutputs outputs;
  assert(!outputs.configured());
  assert(!outputs.armed(0) && !outputs.armed(1));
  assert(!outputs.arm(0)); // Uninitialized driver cannot arm.
  outputs.apply(0, true, true);
  outputs.forceOff();
  assert(events.empty());
  outputs.begin();
#if CGD_ENABLE_PURGE_OUTPUTS
  assert(outputs.configured());
  assert(events.size() == 4);
  // The inactive level must be latched before configuring either GPIO as OUTPUT.
  assert(events[0].write && events[0].pin == 25 && events[0].value == HIGH);
  assert(!events[1].write && events[1].pin == 25 && events[1].value == OUTPUT);
  assert(events[2].write && events[2].pin == 26 && events[2].value == HIGH);
  assert(!events[3].write && events[3].pin == 26 && events[3].value == OUTPUT);
  assert(levels[25] == HIGH && levels[26] == HIGH);
  assert(!outputs.armed(0) && !outputs.armed(1));
  outputs.apply(0, true, true);
  assert(levels[25] == HIGH); // Open requests do nothing before explicit arming.

  const auto beforeInvalid = events.size();
  for (int invalid : {-100, -1, 2, 100}) {
    assert(!outputs.arm(invalid) && !outputs.armed(invalid));
    outputs.stop(invalid);
    outputs.apply(invalid, true, true);
    outputs.apply(invalid, true, false);
  }
  assert(events.size() == beforeInvalid); // Invalid channels never touch a pin.

  assert(outputs.arm(0));
  assert(outputs.armed(0) && !outputs.armed(1));
  assert(levels[25] == HIGH && levels[26] == HIGH); // Arming is not opening.
  outputs.apply(0, false, true);
  assert(levels[25] == HIGH);
  outputs.apply(0, true, true);
  assert(levels[25] == LOW && levels[26] == HIGH);

  assert(outputs.arm(1));
  outputs.apply(1, true, true);
  assert(levels[25] == LOW && levels[26] == LOW);
  outputs.stop(0);
  assert(!outputs.armed(0) && outputs.armed(1));
  assert(levels[25] == HIGH && levels[26] == LOW); // Independent channels.
  outputs.apply(0, true, true);
  assert(levels[25] == HIGH); // A stopped channel cannot reopen without arm().

  outputs.apply(1, true, false);
  assert(!outputs.armed(1));
  assert(levels[26] == HIGH); // Fault closes and disarms, regardless of request.
  outputs.apply(1, true, true);
  assert(levels[26] == HIGH);
  assert(outputs.arm(0) && outputs.arm(1));
  outputs.apply(0, true, true);
  outputs.apply(1, true, true);
  outputs.forceOff();
  assert(levels[25] == HIGH && levels[26] == HIGH);
  assert(outputs.armed(0) && outputs.armed(1)); // Lock-free fallback only writes inactive; owner clears flags.
  outputs.stopAll();
  assert(levels[25] == HIGH && levels[26] == HIGH);
  assert(!outputs.armed(0) && !outputs.armed(1));

  // Composed timer/driver lifecycle: arming may wait indefinitely while closed.
  cgd::PurgeTimer timer(1, 1);
  const auto service = [&](uint32_t now, bool healthy) {
    if (!healthy) timer.fault();
    const bool wasActive = timer.isActive();
    const auto state = timer.tick(now);
    if (outputs.armed(0) && (!healthy || (wasActive && !state.active))) {
      timer.stop();
      outputs.stop(0);
    }
    outputs.apply(0, state.active && state.open, healthy);
  };
  assert(outputs.arm(0));
  for (uint32_t now = 0; now <= 10000; now += 100) service(now, true);
  assert(outputs.armed(0) && levels[25] == HIGH && !timer.state(10000).active);
  timer.startSimulation(10000);
  for (uint32_t now = 10000; now < 70000; now += 100) {
    service(now, true);
    assert(outputs.armed(0) && levels[25] == HIGH);
  }
  service(70000, true);
  assert(timer.state(70000).open && outputs.armed(0) && levels[25] == LOW);
  service(73001, true); // Timer servicing stalled while physically open.
  assert(!timer.state(73001).active && !outputs.armed(0) && levels[25] == HIGH);
  service(73002, true);
  assert(!outputs.armed(0) && levels[25] == HIGH);
  assert(outputs.arm(0));
  timer.startSimulation(80000);
  for (uint32_t now = 80000; now <= 140000; now += 100) service(now, true);
  assert(timer.state(140000).open && levels[25] == LOW);
  service(140001, false); // Fault closes and disarms the complete chain.
  assert(!timer.state(140001).active && !outputs.armed(0) && levels[25] == HIGH);
  assert(outputs.arm(0));
  timer.startSimulation(150000);
  service(153000, true); // Stall before the first service must also disarm.
  assert(!timer.isActive() && !outputs.armed(0) && levels[25] == HIGH);

  // Actual PC simulation requests cannot energize a solenoid before LOCAL arm.
  cgd::CadPurgeTest cad;
  assert(cad.update(true,true,true,200000,200000,6500,true,false));
  outputs.apply(0,cad.requestedOpen(0),cad.current());
  assert(levels[25] == HIGH && !outputs.armed(0));
  assert(cad.arm(0) && outputs.arm(0)); // Mirrors the guarded local API only.
  outputs.apply(0,cad.requestedOpen(0),cad.current());
  assert(levels[25] == LOW && levels[26] == HIGH);
  assert(cad.update(true,true,true,200100,200100,6500,false,true));
  outputs.apply(0,cad.requestedOpen(0),cad.current());
  outputs.apply(1,cad.requestedOpen(1),cad.current());
  assert(levels[25] == HIGH && levels[26] == HIGH); // Channel 2 remains unauthorized.
  assert(cad.arm(1) && outputs.arm(1));
  outputs.apply(1,cad.requestedOpen(1),cad.current()); assert(levels[26] == LOW);
  assert(!cad.update(true,false,true,200200,200100,6500,false,true));
  for(int i=0;i<2;++i){if(!cad.armed(i))outputs.stop(i);outputs.apply(i,cad.requestedOpen(i),cad.current());}
  assert(!outputs.armed(0)&&!outputs.armed(1)&&levels[25]==HIGH&&levels[26]==HIGH);
  assert(cad.update(true,true,true,200300,200300,6500,true,true));
  for(int i=0;i<2;++i)outputs.apply(i,cad.requestedOpen(i),cad.current());
  assert(levels[25]==HIGH&&levels[26]==HIGH); // Reconnection cannot revive authorization.
#else
  assert(!outputs.configured());
  assert(events.empty());
  assert(!outputs.arm(0) && !outputs.arm(1));
  outputs.apply(0, true, true);
  outputs.apply(1, true, true);
  outputs.apply(0, true, false);
  outputs.forceOff();
  outputs.stopAll();
  assert(events.empty());
#endif
  puts("purge_outputs: inactive-before-output boot, explicit arm, fault/stop and isolated GPIOs passed");
}
