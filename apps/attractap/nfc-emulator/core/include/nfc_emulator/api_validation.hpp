#pragma once

#include <string>

namespace nfc_emulator {

struct ApiValidationResult {
  bool valid;
  const char *message;
};

ApiValidationResult validate_provisioning(const std::string &ssid,
                                          const std::string &password,
                                          const std::string &token);
ApiValidationResult validate_removal(int64_t after_ms, int64_t after_exchanges,
                                     int64_t after_instruction);

}  // namespace nfc_emulator
