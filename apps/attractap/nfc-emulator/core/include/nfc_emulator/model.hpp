#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace nfc_emulator {

using Bytes = std::vector<uint8_t>;
using Key = std::array<uint8_t, 16>;

enum class CardType : uint8_t { Ntag424 = 0, DesfireEv2 = 1, DesfireEv3 = 2 };

struct KeySlot {
  Key value{};
  uint8_t version = 0;
};

struct CardState {
  bool active = true;
  bool attraccess_app = false;
  std::array<KeySlot, 6> keys{};
  Bytes ndef{0x00, 0x00};
};

struct CardProfile {
  std::string id;
  CardType type = CardType::Ntag424;
  std::array<uint8_t, 4> uid{0x08, 0x00, 0x00, 0x01};
  CardState state{};
  CardState factory{};
};

struct ValidationError {
  std::string field;
  std::string message;
};

CardProfile factory_profile(std::string id, CardType type,
                            std::array<uint8_t, 4> uid);
std::vector<ValidationError> validate(const CardProfile &profile);
void factory_reset(CardProfile &profile);
std::string card_type_name(CardType type);
bool parse_card_type(const std::string &value, CardType &type);
std::string hex(const Bytes &bytes);
bool unhex(const std::string &value, Bytes &bytes);

}  // namespace nfc_emulator
