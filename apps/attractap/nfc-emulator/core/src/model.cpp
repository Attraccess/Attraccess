#include "nfc_emulator/model.hpp"

#include <cctype>

namespace nfc_emulator {

CardProfile factory_profile(std::string id, CardType type,
                            std::array<uint8_t, 4> uid) {
  CardProfile profile;
  profile.id = std::move(id);
  profile.type = type;
  profile.uid = uid;
  profile.state.attraccess_app = type == CardType::Ntag424;
  profile.factory = profile.state;
  return profile;
}

std::vector<ValidationError> validate(const CardProfile &profile) {
  std::vector<ValidationError> errors;
  if (profile.id.empty() || profile.id.size() > 31) {
    errors.push_back({"id", "must contain 1..31 characters"});
  }
  for (char character : profile.id) {
    if (!std::isalnum(static_cast<unsigned char>(character)) && character != '-' &&
        character != '_') {
      errors.push_back({"id", "may contain only letters, digits, '-' and '_'"});
      break;
    }
  }
  if (profile.uid[0] != 0x08) {
    errors.push_back({"uid", "PN532 target UID must begin with 08"});
  }
  if (profile.state.ndef.size() > 1024 || profile.factory.ndef.size() > 1024) {
    errors.push_back({"ndef", "maximum NDEF size is 1024 bytes"});
  }
  return errors;
}

void factory_reset(CardProfile &profile) { profile.state = profile.factory; }

std::string card_type_name(CardType type) {
  switch (type) {
    case CardType::Ntag424: return "ntag424";
    case CardType::DesfireEv2: return "desfire-ev2";
    case CardType::DesfireEv3: return "desfire-ev3";
  }
  return "unknown";
}

bool parse_card_type(const std::string &value, CardType &type) {
  if (value == "ntag424") type = CardType::Ntag424;
  else if (value == "desfire-ev2") type = CardType::DesfireEv2;
  else if (value == "desfire-ev3") type = CardType::DesfireEv3;
  else return false;
  return true;
}

std::string hex(const Bytes &bytes) {
  static constexpr char digits[] = "0123456789abcdef";
  std::string result;
  result.reserve(bytes.size() * 2);
  for (uint8_t byte : bytes) {
    result.push_back(digits[byte >> 4]);
    result.push_back(digits[byte & 0x0f]);
  }
  return result;
}

bool unhex(const std::string &value, Bytes &bytes) {
  if (value.size() % 2 != 0) return false;
  bytes.clear();
  bytes.reserve(value.size() / 2);
  auto nibble = [](char c) -> int {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
  };
  for (size_t i = 0; i < value.size(); i += 2) {
    int high = nibble(value[i]);
    int low = nibble(value[i + 1]);
    if (high < 0 || low < 0) {
      bytes.clear();
      return false;
    }
    bytes.push_back(static_cast<uint8_t>((high << 4) | low));
  }
  return true;
}

}  // namespace nfc_emulator
