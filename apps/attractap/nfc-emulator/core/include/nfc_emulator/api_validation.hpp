#pragma once

#include <cstdint>
#include <string>

namespace nfc_emulator {

struct ApiValidationResult {
  bool valid;
  const char *message;
};

ApiValidationResult validate_removal(int64_t after_ms, int64_t after_exchanges,
                                     int64_t after_instruction);

// Splits a serial request line into its command and its optional JSON
// arguments. Returns false for blank lines and malformed command names.
bool parse_command_line(const std::string &line, std::string &command,
                        std::string &arguments);

}  // namespace nfc_emulator
