#include "nfc_emulator/api_validation.hpp"

namespace nfc_emulator {

ApiValidationResult validate_provisioning(const std::string &ssid,
                                          const std::string &password,
                                          const std::string &token) {
  if (ssid.empty() || ssid.size() > 32)
    return {false, "ssid must contain 1..32 bytes"};
  if ((!password.empty() && password.size() < 8) || password.size() > 63)
    return {false, "password must be empty for open Wi-Fi or contain 8..63 bytes"};
  if (token.size() < 16 || token.size() > 128)
    return {false, "token must contain 16..128 bytes"};
  return {true, ""};
}

ApiValidationResult validate_removal(int64_t after_ms, int64_t after_exchanges,
                                     int64_t after_instruction) {
  if (after_ms < -1 || after_ms == 0 || after_exchanges < -1 || after_exchanges == 0 ||
      after_instruction < -1 ||
      after_instruction > 255)
    return {false, "removal values are outside their allowed range"};
  if (after_ms < 0 && after_exchanges < 0 && after_instruction < 0)
    return {false, "at least one removal trigger is required"};
  return {true, ""};
}

}  // namespace nfc_emulator
