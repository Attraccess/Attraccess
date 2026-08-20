#pragma once

#include "nvs_store.hpp"

namespace nfc_emulator {
bool start_network(NvsStore &store);
void start_serial_provisioning(NvsStore &store);
}
