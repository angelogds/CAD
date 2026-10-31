#include <cassert>
#include <stdint.h>
#include <vector>
#include "bench_leds.h"
#include "bench_drivers.h"

static int levels[40];
static bool monitoring=false;
static std::vector<int> writesOff;
void digitalWrite(int pin,int level) {
  levels[pin]=level;
  if(level==HIGH)writesOff.push_back(pin);
  if(monitoring) {
    assert(!(levels[25]==LOW&&levels[26]==LOW));
    assert(!(levels[32]==LOW&&levels[33]==LOW));
    assert(levels[16]==HIGH&&levels[17]==HIGH); // No writes to former outputs.
  }
}
int digitalRead(int pin) { return levels[pin]; }
void pinMode(int,int) {}
uint32_t millis() { return 100; }
static void checkDrivers() {
  for(int &level:levels)level=HIGH;
  benchPinsCompatible=true;levels[27]=LOW;
  PurgeOutputs purges;CgdGatePulse gates;
  purges.begin();gates.begin();monitoring=true;
  purges.applyBench(true,false,true);assert(levels[25]==HIGH&&levels[26]==LOW);
  purges.applyBench(true,true,false);assert(levels[25]==LOW&&levels[26]==HIGH);
  writesOff.clear();purges.applyBench(true,true,false);
  for(int pin:writesOff)assert(pin!=25); // Sustained relay never pulses off.
  purges.applyBench(true,true,true);assert(levels[25]==HIGH&&levels[26]==HIGH);
  purges.applyBench(true,true,false);purges.applyBench(false,true,false);
  assert(levels[25]==HIGH&&levels[26]==HIGH);
  gates.apply(true,false,false);assert(levels[32]==HIGH&&levels[33]==HIGH);
  gates.apply(true,true,false);assert(levels[32]==LOW&&levels[33]==HIGH);
  writesOff.clear();gates.apply(true,true,false);
  for(int pin:writesOff)assert(pin!=32); // Held coil must not chatter.
  gates.apply(true,false,true);assert(levels[32]==HIGH&&levels[33]==LOW);
  gates.apply(true,true,true);assert(levels[32]==HIGH&&levels[33]==HIGH);
  levels[27]=HIGH;gates.apply(true,true,false);
#if CGD_BENCH_REQUIRE_LOCAL_KEY
  assert(levels[32]==HIGH&&levels[33]==HIGH);
#else
  assert(levels[32]==LOW&&levels[33]==HIGH);
#endif
  gates.stop();assert(levels[32]==HIGH&&levels[33]==HIGH);
  for(int pin:writesOff)assert(pin!=16&&pin!=17);
  monitoring=false;
}

static cgd::BenchInput packet(uint32_t now=100U) {
  cgd::BenchInput i;
  i.cadMode=i.wifi=i.packet=i.complete=i.key=i.compatible=true;
  i.green=true;i.camisa=true;i.receivedAt=now;i.validity=6500U;
  return i;
}
static void off(const cgd::BenchState &s) { for(bool value:s.outputs)assert(!value); }
static void isolated(const cgd::BenchState &s,int channel) {
  assert(s.testing&&!s.mirroring);
  for(int j=0;j<7;++j)assert(s.outputs[j]==(j==channel));
}
int main() {
  cgd::BenchLeds c;auto i=packet();
  off(c.tick(i,100)); // Fresh network packets and a held key never authorize boot.
  c.selectCad(100);auto s=c.tick(i,100);
  assert(s.mirroring&&s.outputs[2]&&s.outputs[3]&&!s.outputs[5]&&!s.outputs[6]);
  i.loadOpen=true;s=c.tick(i,110);assert(s.outputs[5]&&!s.outputs[6]);
  i.loadOpen=false;i.dischargeOpen=true;s=c.tick(i,120);
  assert(s.outputs[6]&&!s.outputs[5]);
  i.loadOpen=true;off(c.tick(i,130)); // Load/discharge interlock faults the cycle.
  i.loadOpen=false;off(c.tick(i,140));
  c.selectCad(150);assert(c.tick(i,150).mirroring);

  // Each prerequisite fails closed and fresh packets alone cannot revive it.
  for(int flag=0;flag<6;++flag) {
    cgd::BenchLeds b;auto p=packet();b.selectCad(100);assert(b.tick(p,100).mirroring);
    switch(flag){case 0:p.wifi=false;break;case 1:p.packet=false;break;
      case 2:p.complete=false;break;case 3:p.key=false;break;
      case 4:p.compatible=false;break;default:p.cadMode=false;}
    off(b.tick(p,110));
    p=packet(120);
    // A deliberate key OFF->ON can reset a fault; no other automatic rearm.
    if(flag==3)assert(b.tick(p,120).mirroring);else off(b.tick(p,120));
    b.selectCad(130);assert(b.tick(p,130).mirroring);
  }
  cgd::BenchLeds ttl;i=packet();ttl.selectCad(100);
  for(uint32_t t=100;t<=6100;t+=1000)assert(ttl.tick(i,t).mirroring);
  assert(ttl.tick(i,6600).mirroring);off(ttl.tick(i,6601));
  i=packet(6610);off(ttl.tick(i,6610));
  ttl.selectCad(6620);assert(ttl.tick(i,6620).mirroring);
  // Local task stall must latch even if the network task kept packets fresh.
  i=packet(9000);off(ttl.tick(i,9000));
  const uint32_t invalidTTLs[]={0U,6501U,UINT32_MAX};
  for(uint32_t validity:invalidTTLs) {
    cgd::BenchLeds invalid;auto p=packet();p.validity=validity;invalid.selectCad(100);off(invalid.tick(p,100));
  }
  // Opening/closing the key cannot revive an explicit stop.
  cgd::BenchLeds stopped;i=packet();stopped.selectCad(100);stopped.tick(i,100);stopped.stop();
  off(stopped.tick(i,110));i.key=false;off(stopped.tick(i,120));
  i.key=true;off(stopped.tick(i,130));stopped.selectCad(140);assert(stopped.tick(i,140).mirroring);

  for(int conflict=0;conflict<4;++conflict) {
    cgd::BenchLeds b;auto p=packet();
    if(conflict==0)p.eixo=true;
    if(conflict==1)p.red=true;
    if(conflict==2)p.yellow=true;
    if(conflict==3){p.green=false;p.red=p.yellow=true;}
    b.selectCad(100);off(b.tick(p,100)); // A local isolated test ignores conflicting CAD values.
  }

  for(int channel=0;channel<7;++channel) {
    cgd::BenchLeds b;auto p=packet();b.selectCad(100);b.tick(p,100);
    assert(b.startTest(channel,p,110));isolated(b.tick(p,110),channel);
    assert(!b.startTest((channel+1)%7,p,120));
    isolated(b.tick(p,1110),channel);isolated(b.tick(p,2109),channel);
    off(b.tick(p,2110));off(b.tick(p,2120)); // Expiry never resumes the cycle.
    assert(!b.startTest(channel,p,2120)); // Cooldown.
    assert(b.startTest(channel,p,3110));isolated(b.tick(p,3110),channel);
    p.wifi=false;isolated(b.tick(p,3120),channel);p.wifi=true;isolated(b.tick(p,3130),channel);
    p.key=false;off(b.tick(p,3140));p.key=true;off(b.tick(p,3150));
    b.selectCad(3160);assert(b.tick(p,3160).mirroring);
  }
  // The same expiry arithmetic remains safe across the millis() rollover.
  cgd::BenchLeds rollover;const uint32_t start=UINT32_MAX-1000U;
  i=packet(start);rollover.selectCad(start);assert(rollover.tick(i,start).mirroring);
  assert(rollover.startTest(5,i,start+10U));isolated(rollover.tick(i,start+20U),5);
  isolated(rollover.tick(i,start+1100U),5);off(rollover.tick(i,start+2010U));
  // Offline/AP tests work on all seven mapped channels without any CAD cycle.
  for(int channel=0;channel<7;++channel){
    cgd::BenchLeds b;cgd::BenchInput local;local.key=local.compatible=true;
    assert(b.startTest(channel,local,100));isolated(b.tick(local,100),channel);
    isolated(b.tick(local,1100),channel);off(b.tick(local,2100));off(b.tick(local,2110));
    b.selectCad(2200);off(b.tick(local,2200)); // No cloud packet, no mirror.
    local.compatible=false;assert(!b.startTest(channel,local,3200));
    local.compatible=true;local.key=false;assert(!b.startTest(channel,local,3200));
  }
  cgd::BenchLeds local;cgd::BenchInput l;l.localMode=l.key=l.compatible=l.green=true;
  l.receivedAt=100;l.validity=5000;local.selectLocal(100);
  for(uint32_t t=100;t<=5100;t+=1000){
    auto out=local.tick(l,t);assert(out.local&&!out.mirroring&&out.outputs[2]);
    for(int ch=3;ch<7;++ch)assert(!out.outputs[ch]);
  }
  off(local.tick(l,5101));l.receivedAt=5200;off(local.tick(l,5200));
  local.selectLocal(5300);assert(local.tick(l,5300).local);
  local.stop();off(local.tick(l,5310));
  checkDrivers();
  return 0;
}
