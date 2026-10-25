#include "../cad_simulation_json.h"
#include <assert.h>
#include <fstream>
#include <sstream>
#include <stdio.h>
int main(int argc, char** argv) {
  assert(argc == 2);
  std::ifstream file(argv[1]); std::stringstream buffer; buffer << file.rdbuf();
  const auto json = buffer.str(); cgd::CadSimulationCommand command;
  assert(cgd::parseCadSimulationJson(json.c_str(), json.size(), 1, command));
  assert(command.active && command.temperature == 75 && command.completeState && command.heating);
  assert(command.purgeOpen[0] && !command.purgeOpen[1]);
  assert(command.version == 12 && command.validity == 6500);
  assert(!cgd::parseCadSimulationJson(json.c_str(), json.size(), 2, command));
  auto wrong = json; const auto at = wrong.find("\"origem\": \"SIMULACAO\"");
  assert(at != std::string::npos); wrong.replace(at, 21, "\"origem\": \"REAL\"");
  assert(!cgd::parseCadSimulationJson(wrong.c_str(), wrong.size(), 1, command));
  puts("cad_simulation_json: actual SUPERVISAO envelope / nested SIMULACAO parsed with ArduinoJson");
}
