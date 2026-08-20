#include "nfc_emulator/behavior.hpp"

#include <algorithm>

namespace nfc_emulator {

namespace {
uint8_t instruction(const Bytes &apdu) { return apdu.size() > 1 ? apdu[1] : 0xff; }

bool matches(const Override &rule, const Bytes &apdu) {
  if (rule.command.size() != apdu.size()) return false;
  for (size_t i = 0; i < apdu.size(); ++i) {
    uint8_t mask = rule.mask && i < rule.mask->size() ? (*rule.mask)[i] : 0xff;
    if ((rule.command[i] & mask) != (apdu[i] & mask)) return false;
  }
  return true;
}
}  // namespace

ExchangeResult BehaviorController::exchange(CardProfile &profile,
                                             const Bytes &apdu,
                                             ProtocolEngine &engine) {
  const uint8_t ins = instruction(apdu);
  if (ins == 0x71) engine.reset_authentication();
  ++exchanges_;
  for (auto rule = overrides_.begin(); rule != overrides_.end(); ++rule) {
    if (matches(*rule, apdu)) {
      ExchangeResult result = rule->result;
      if (rule->remaining == 1) overrides_.erase(rule);
      else if (rule->remaining > 1) --rule->remaining;
      result.source = "override";
      if (result.outcome != Outcome::Response) engine.reset_session();
      else if (ins == 0x71 || ins == 0xaf) engine.reset_authentication();
      evaluate_removal(ins);
      return result;
    }
  }

  if (fault_ && (!fault_->instruction || *fault_->instruction == instruction(apdu)) &&
      fault_->remaining > 0) {
    --fault_->remaining;
    ExchangeResult result{fault_->outcome, fault_->response, fault_->delay_ms,
                          "fault"};
    if (result.outcome != Outcome::Response) engine.reset_session();
    else if (ins == 0x71 || ins == 0xaf) engine.reset_authentication();
    evaluate_removal(ins);
    return result;
  }

  ExchangeResult result;
  if (scenario_ == Scenario::Timeout) result = {Outcome::Timeout, {}, 0, "scenario"};
  else if ((scenario_ == Scenario::AuthenticationFailure || scenario_ == Scenario::WrongKey) && ins == 0x71) {
    engine.reset_authentication();
    result = {Outcome::Response, {0x91, 0xae}, 0, "scenario"};
  } else if (scenario_ == Scenario::MalformedResponse)
    result = {Outcome::Response, {0xde, 0xad}, 0, "scenario"};
  else result = engine.exchange(profile, apdu);
  if (result.source == "scenario") {
    if (result.outcome != Outcome::Response) engine.reset_session();
    else if (ins == 0x71 || ins == 0xaf) engine.reset_authentication();
  }
  evaluate_removal(ins);
  return result;
}

void BehaviorController::evaluate_removal(uint8_t ins, uint32_t elapsed_ms) {
  if (removal_.after_exchanges && exchanges_ >= removal_.after_exchanges)
    should_remove_ = true;
  if (removal_.after_instruction && *removal_.after_instruction == ins)
    should_remove_ = true;
  if (removal_.after_ms && elapsed_ms >= removal_.after_ms)
    should_remove_ = true;
}

bool BehaviorController::should_remove(uint32_t elapsed_ms) {
  evaluate_removal(0xff, elapsed_ms);
  return should_remove_;
}

void BehaviorController::begin_presentation() {
  exchanges_ = 0;
  should_remove_ = false;
}

void BehaviorController::set_fault(std::optional<Fault> fault) {
  fault_ = std::move(fault);
  begin_presentation();
}

void BehaviorController::set_overrides(std::vector<Override> overrides) {
  overrides_ = std::move(overrides);
  begin_presentation();
}

void BehaviorController::set_removal(RemovalPolicy removal) {
  removal_ = removal;
  begin_presentation();
}

std::array<uint8_t, 4> BehaviorController::presentation_uid(const CardProfile &profile) const {
  return scenario_ == Scenario::UnknownUid
             ? std::array<uint8_t, 4>{0x08, 0xff, 0xff, 0xff}
             : profile.uid;
}

void BehaviorController::set_scenario(Scenario scenario) {
  scenario_ = scenario;
  begin_presentation();
}

void BehaviorController::clear() {
  scenario_ = Scenario::Valid;
  fault_.reset();
  overrides_.clear();
  removal_ = {};
  exchanges_ = 0;
  should_remove_ = false;
}

bool parse_scenario(const std::string &value, Scenario &scenario) {
  static const std::pair<const char *, Scenario> values[] = {
      {"valid", Scenario::Valid}, {"unknown-uid", Scenario::UnknownUid},
      {"inactive", Scenario::Inactive}, {"wrong-key", Scenario::WrongKey},
      {"authentication-failure", Scenario::AuthenticationFailure},
      {"timeout", Scenario::Timeout},
      {"malformed-response", Scenario::MalformedResponse},
      {"removal-timing", Scenario::RemovalTiming}};
  for (const auto &entry : values) {
    if (value == entry.first) {
      scenario = entry.second;
      return true;
    }
  }
  return false;
}

std::string scenario_name(Scenario scenario) {
  switch (scenario) {
    case Scenario::Valid: return "valid";
    case Scenario::UnknownUid: return "unknown-uid";
    case Scenario::Inactive: return "inactive";
    case Scenario::WrongKey: return "wrong-key";
    case Scenario::AuthenticationFailure: return "authentication-failure";
    case Scenario::Timeout: return "timeout";
    case Scenario::MalformedResponse: return "malformed-response";
    case Scenario::RemovalTiming: return "removal-timing";
  }
  return "valid";
}

}  // namespace nfc_emulator
