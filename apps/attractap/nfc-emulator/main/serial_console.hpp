#pragma once

#include "emulator.hpp"
#include "nvs_store.hpp"

namespace nfc_emulator {
bool start_serial_console(EmulatorState &state, NvsStore &store);
}
