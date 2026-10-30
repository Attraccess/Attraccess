#pragma once

#include "emulator.hpp"
#include "nvs_store.hpp"

#include "cJSON.h"

#include <string>

namespace nfc_emulator {

// Result of one serial command. `result` is owned by the reply and is only set
// on success; `code` and `message` are only set on failure.
struct Reply {
  bool ok = true;
  cJSON *result = nullptr;
  const char *code = "";
  std::string message;
};

// Executes one command. `arguments` is the parsed JSON object that followed
// the command name, or null when none was given.
Reply run_command(EmulatorState &state, NvsStore &store, const std::string &command,
                  cJSON *arguments);

}  // namespace nfc_emulator
