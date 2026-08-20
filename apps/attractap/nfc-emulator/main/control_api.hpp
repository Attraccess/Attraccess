#pragma once

#include "emulator.hpp"
#include "nvs_store.hpp"

namespace nfc_emulator {
bool start_control_api(EmulatorState &state, NvsStore &store);
}
