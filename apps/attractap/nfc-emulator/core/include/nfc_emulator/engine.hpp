#pragma once

#include "nfc_emulator/model.hpp"

#include <functional>

namespace nfc_emulator {

enum class Outcome { Response, Timeout, Removed, Error };

struct ExchangeResult {
  Outcome outcome = Outcome::Response;
  Bytes response;
  uint32_t delay_ms = 0;
  std::string source = "engine";
};

class ProtocolEngine {
 public:
  using RandomSource = std::function<void(uint8_t *, size_t)>;

  explicit ProtocolEngine(RandomSource random = {});
  ExchangeResult exchange(CardProfile &profile, const Bytes &apdu);
  void reset_session();
  void reset_authentication() { clear_authentication(); }

 private:
  enum class Selected { None, NdefApplication, CapabilityContainer, NdefData, Picc, Attraccess };
  CardProfile *profile_ = nullptr;
  RandomSource random_;
  Selected selected_ = Selected::None;
  uint8_t version_frame_ = 0;
  uint8_t pending_key_ = 0xff;
  Bytes rnd_b_;
  Bytes ti_;
  Key session_enc_{};
  Key session_mac_{};
  uint16_t counter_ = 0;
  bool authenticated_ = false;

  ExchangeResult native(const Bytes &apdu, uint8_t ins, const Bytes &data);
  ExchangeResult authenticate_first(const Bytes &data);
  ExchangeResult authenticate_continue(const Bytes &data);
  ExchangeResult change_key(const Bytes &data);
  ExchangeResult version();
  ExchangeResult iso(const Bytes &apdu);
  Bytes response_mac(uint8_t status, const Bytes &data = {}) const;
  ExchangeResult authentication_failure(uint8_t status = 0xae);
  void clear_authentication();
};

}  // namespace nfc_emulator
