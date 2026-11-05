#include "nfc_emulator/api_validation.hpp"

namespace nfc_emulator {

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

ApiValidationResult validate_button_press(int64_t press_ms, int64_t count, int64_t gap_ms) {
  if (press_ms < 10 || press_ms > 5000) return {false, "ms must be from 10 to 5000"};
  if (count < 1 || count > 5) return {false, "count must be from 1 to 5"};
  if (gap_ms < 10 || gap_ms > 2000) return {false, "gapMs must be from 10 to 2000"};
  return {true, ""};
}

bool parse_command_line(const std::string &line, std::string &command,
                        std::string &arguments) {
  const char *whitespace = " \t\r\n";
  size_t start = line.find_first_not_of(whitespace);
  if (start == std::string::npos) return false;
  size_t end = line.find_first_of(whitespace, start);
  command = line.substr(start, end == std::string::npos ? std::string::npos : end - start);
  for (char c : command) {
    if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '.' || c == '-'))
      return false;
  }
  arguments.clear();
  if (end == std::string::npos) return true;
  size_t first = line.find_first_not_of(whitespace, end);
  if (first == std::string::npos) return true;
  size_t last = line.find_last_not_of(whitespace);
  arguments = line.substr(first, last - first + 1);
  return true;
}

}  // namespace nfc_emulator
