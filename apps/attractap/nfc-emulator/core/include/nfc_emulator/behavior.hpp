#pragma once

#include "nfc_emulator/engine.hpp"

#include <optional>

namespace nfc_emulator {

enum class Scenario {
  Valid,
  UnknownUid,
  Inactive,
  WrongKey,
  AuthenticationFailure,
  Timeout,
  MalformedResponse,
  RemovalTiming
};

struct Fault {
  std::optional<uint8_t> instruction;
  Outcome outcome = Outcome::Error;
  Bytes response;
  uint32_t delay_ms = 0;
  uint32_t remaining = 1;
};

struct Override {
  Bytes command;
  std::optional<Bytes> mask;
  ExchangeResult result;
  uint32_t remaining = 0;
};

struct RemovalPolicy {
  uint32_t after_ms = 0;
  uint32_t after_exchanges = 0;
  std::optional<uint8_t> after_instruction;
};

class BehaviorController {
 public:
  ExchangeResult exchange(CardProfile &profile, const Bytes &apdu,
                          ProtocolEngine &engine);
  void set_scenario(Scenario scenario);
  void set_fault(std::optional<Fault> fault);
  void set_overrides(std::vector<Override> overrides);
  void set_removal(RemovalPolicy removal);
  void begin_presentation();
  void clear();
  bool should_remove(uint32_t elapsed_ms = 0);
  std::array<uint8_t, 4> presentation_uid(const CardProfile &profile) const;

 private:
  Scenario scenario_ = Scenario::Valid;
  std::optional<Fault> fault_;
  std::vector<Override> overrides_;
  RemovalPolicy removal_;
  uint32_t exchanges_ = 0;
  bool should_remove_ = false;

  void evaluate_removal(uint8_t instruction, uint32_t elapsed_ms = 0);
};

bool parse_scenario(const std::string &value, Scenario &scenario);
std::string scenario_name(Scenario scenario);

}  // namespace nfc_emulator
