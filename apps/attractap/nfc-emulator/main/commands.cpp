#include "commands.hpp"
#include "nfc_emulator/api_validation.hpp"

#include "esp_timer.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>

namespace nfc_emulator {
namespace {

Reply ok(cJSON *result = nullptr) {
  Reply reply;
  reply.result = result ? result : cJSON_CreateObject();
  return reply;
}

Reply fail(const char *code, std::string message) {
  Reply reply;
  reply.ok = false;
  reply.code = code;
  reply.message = std::move(message);
  return reply;
}

cJSON *field(cJSON *arguments, const char *name) {
  return cJSON_GetObjectItemCaseSensitive(arguments, name);
}

bool integer_value(cJSON *item, int64_t minimum, int64_t maximum, int64_t &value) {
  if (!cJSON_IsNumber(item) || !std::isfinite(item->valuedouble) ||
      std::floor(item->valuedouble) != item->valuedouble ||
      item->valuedouble < static_cast<double>(minimum) ||
      item->valuedouble > static_cast<double>(maximum)) return false;
  value = static_cast<int64_t>(item->valuedouble);
  return true;
}

cJSON *profile_json(const CardProfile &profile) {
  cJSON *json = cJSON_CreateObject();
  cJSON_AddStringToObject(json, "id", profile.id.c_str());
  cJSON_AddStringToObject(json, "type", card_type_name(profile.type).c_str());
  Bytes uid(profile.uid.begin(), profile.uid.end());
  cJSON_AddStringToObject(json, "uid", hex(uid).c_str());
  cJSON_AddBoolToObject(json, "active", profile.state.active);
  cJSON_AddBoolToObject(json, "attraccessApp", profile.state.attraccess_app);
  cJSON_AddStringToObject(json, "ndef", hex(profile.state.ndef).c_str());
  cJSON *keys = cJSON_AddArrayToObject(json, "keys");
  for (size_t index = 0; index < profile.state.keys.size(); ++index) {
    cJSON *item = cJSON_CreateObject();
    cJSON_AddNumberToObject(item, "number", index);
    cJSON_AddNumberToObject(item, "version", profile.state.keys[index].version);
    Bytes value(profile.state.keys[index].value.begin(), profile.state.keys[index].value.end());
    cJSON_AddStringToObject(item, "value", hex(value).c_str());
    cJSON_AddItemToArray(keys, item);
  }
  return json;
}

bool profile_from_json(cJSON *json, CardProfile &profile, std::string &message) {
  cJSON *id = field(json, "id");
  cJSON *type = field(json, "type");
  cJSON *uid = field(json, "uid");
  if (!cJSON_IsString(id) || !cJSON_IsString(type) || !cJSON_IsString(uid)) {
    message = "id, type and uid are required strings"; return false;
  }
  CardType card_type;
  Bytes uid_bytes;
  if (!parse_card_type(type->valuestring, card_type) || !unhex(uid->valuestring, uid_bytes) || uid_bytes.size() != 4) {
    message = "type or four-byte hexadecimal uid is invalid"; return false;
  }
  std::array<uint8_t,4> fixed_uid{};
  std::copy(uid_bytes.begin(), uid_bytes.end(), fixed_uid.begin());
  profile = factory_profile(id->valuestring, card_type, fixed_uid);
  cJSON *app = field(json, "attraccessApp");
  if (app && !cJSON_IsBool(app)) { message = "attraccessApp must be boolean"; return false; }
  if (cJSON_IsBool(app)) profile.state.attraccess_app = cJSON_IsTrue(app);
  cJSON *active = field(json, "active");
  if (active && !cJSON_IsBool(active)) { message = "active must be boolean"; return false; }
  if (cJSON_IsBool(active)) profile.state.active = cJSON_IsTrue(active);
  cJSON *ndef = field(json, "ndef");
  if (ndef && !cJSON_IsString(ndef)) { message = "ndef must be hexadecimal"; return false; }
  if (cJSON_IsString(ndef) && !unhex(ndef->valuestring, profile.state.ndef)) {
    message = "ndef must be hexadecimal"; return false;
  }
  cJSON *keys = field(json, "keys");
  if (keys && !cJSON_IsArray(keys)) { message = "keys must be an array"; return false; }
  std::array<bool, 6> seen_keys{};
  cJSON *item = nullptr;
  cJSON_ArrayForEach(item, keys) {
    cJSON *number = field(item, "number");
    cJSON *version = field(item, "version");
    cJSON *value = field(item, "value");
    Bytes key_bytes;
    int64_t key_number = 0, key_version = 0;
    if (!integer_value(number, 0, 5, key_number) ||
        !integer_value(version, 0, 255, key_version) || seen_keys[key_number] ||
        !cJSON_IsString(value) || !unhex(value->valuestring, key_bytes) || key_bytes.size() != 16) {
      message = "each key needs number 0..5, version 0..255 and 16-byte value"; return false;
    }
    seen_keys[key_number] = true;
    auto &slot = profile.state.keys[key_number];
    std::copy(key_bytes.begin(), key_bytes.end(), slot.value.begin());
    slot.version = key_version;
  }
  profile.factory = profile.state;
  auto errors = validate(profile);
  if (!errors.empty()) { message = errors.front().field + ": " + errors.front().message; return false; }
  return true;
}

const char *outcome_name(Outcome outcome) {
  switch (outcome) {
    case Outcome::Response: return "response";
    case Outcome::Timeout: return "timeout";
    case Outcome::Removed: return "removed";
    case Outcome::Error: return "error";
  }
  return "error";
}

bool presenting(const EmulatorState &state) {
  return state.present_requested || state.target_armed || state.rf_active;
}

Reply status(EmulatorState &state) {
  bool requested, armed, active;
  std::optional<CardProfile> profile;
  {
    std::lock_guard<std::mutex> lock(state.mutex);
    requested = state.present_requested;
    armed = state.target_armed;
    active = state.rf_active;
    profile = state.active_profile;
  }
  cJSON *json = cJSON_CreateObject();
  cJSON_AddBoolToObject(json, "presentRequested", requested);
  cJSON_AddBoolToObject(json, "targetArmed", armed);
  cJSON_AddBoolToObject(json, "rfActive", active);
  if (profile) cJSON_AddItemToObject(json, "profile", profile_json(*profile));
  else cJSON_AddNullToObject(json, "profile");
  return ok(json);
}

Reply list_profiles(EmulatorState &state, NvsStore &store) {
  std::vector<CardProfile> profiles;
  {
    std::lock_guard<std::mutex> storage_lock(state.storage_mutex);
    if (!store.list_profiles(profiles))
      return fail("persist_failed", "profiles could not be enumerated");
  }
  std::sort(profiles.begin(), profiles.end(),
            [](const CardProfile &left, const CardProfile &right) {
              return left.id < right.id;
            });
  cJSON *json = cJSON_CreateArray();
  for (const auto &profile : profiles) cJSON_AddItemToArray(json, profile_json(profile));
  return ok(json);
}

Reply create_profile(EmulatorState &state, cJSON *arguments) {
  CardProfile profile; std::string message;
  if (!profile_from_json(arguments, profile, message)) return fail("invalid_profile", message);
  std::lock_guard<std::mutex> storage_lock(state.storage_mutex);
  CardProfile existing;
  if (state.profiles.load(profile.id, existing))
    return fail("profile_exists", "use profiles.update to replace an existing profile");
  if (!state.profiles.save(profile)) return fail("persist_failed", "profile was not saved");
  return ok(profile_json(profile));
}

Reply get_profile(EmulatorState &state, cJSON *arguments) {
  cJSON *id = field(arguments, "id");
  if (!cJSON_IsString(id)) return fail("invalid_request", "id string is required");
  std::lock_guard<std::mutex> storage_lock(state.storage_mutex);
  CardProfile profile;
  if (!state.profiles.load(id->valuestring, profile)) return fail("not_found", "profile not found");
  return ok(profile_json(profile));
}

Reply update_profile(EmulatorState &state, cJSON *arguments) {
  CardProfile profile; std::string message;
  if (!profile_from_json(arguments, profile, message)) return fail("invalid_profile", message);
  std::lock_guard<std::mutex> storage_lock(state.storage_mutex);
  CardProfile existing;
  if (!state.profiles.load(profile.id, existing)) return fail("not_found", "profile not found");
  std::unique_lock<std::mutex> lock(state.mutex);
  bool affects_active = state.active_profile && state.active_profile->id == profile.id;
  if (affects_active && presenting(state))
    return fail("profile_presented", "remove the active profile before replacing it");
  if (!affects_active) lock.unlock();
  if (!state.profiles.save(profile)) return fail("persist_failed", "profile was not replaced");
  if (affects_active) {
    state.active_profile = profile;
    state.engine.reset_session();
    ++state.profile_revision;
  }
  return ok(profile_json(profile));
}

Reply delete_profile(EmulatorState &state, cJSON *arguments) {
  cJSON *id_item = field(arguments, "id");
  if (!cJSON_IsString(id_item)) return fail("invalid_request", "id string is required");
  std::string id = id_item->valuestring;
  std::lock_guard<std::mutex> storage_lock(state.storage_mutex);
  CardProfile profile;
  if (!state.profiles.load(id, profile)) return fail("not_found", "profile not found");
  std::unique_lock<std::mutex> lock(state.mutex);
  bool affects_active = state.active_profile && state.active_profile->id == id;
  if (affects_active && presenting(state))
    return fail("profile_presented", "remove the active profile before deleting it");
  if (!affects_active) lock.unlock();
  if (!state.profiles.remove(id)) return fail("persist_failed", "profile was not deleted");
  if (affects_active) {
    state.present_requested = false;
    state.active_profile.reset();
    state.engine.reset_session();
    ++state.profile_revision;
    state.changed.notify_all();
  }
  return ok();
}

Reply select_profile(EmulatorState &state, cJSON *arguments) {
  cJSON *id = field(arguments, "id");
  if (!cJSON_IsString(id)) return fail("invalid_request", "id string is required");
  std::lock_guard<std::mutex> storage_lock(state.storage_mutex);
  CardProfile profile;
  if (!state.profiles.load(id->valuestring, profile)) return fail("not_found", "profile not found");
  std::lock_guard<std::mutex> lock(state.mutex);
  if (presenting(state))
    return fail("profile_presented", "remove the current profile before selecting another");
  state.active_profile = profile;
  state.engine.reset_session();
  ++state.profile_revision;
  state.changed.notify_all();
  return ok(profile_json(profile));
}

Reply set_scenario(EmulatorState &state, cJSON *arguments) {
  cJSON *name = field(arguments, "name");
  Scenario scenario;
  if (!cJSON_IsString(name) || !parse_scenario(name->valuestring, scenario))
    return fail("invalid_scenario", "unknown scenario name");
  std::lock_guard<std::mutex> lock(state.mutex);
  state.behavior.set_scenario(scenario);
  return ok();
}

Reply set_fault(EmulatorState &state, cJSON *arguments) {
  Fault fault;
  cJSON *instruction = field(arguments, "instruction");
  cJSON *outcome = field(arguments, "outcome");
  cJSON *response = field(arguments, "response");
  cJSON *delay = field(arguments, "delayMs");
  cJSON *count = field(arguments, "count");
  int64_t numeric = 0;
  if (instruction && !integer_value(instruction, 0, 255, numeric))
    return fail("invalid_fault", "instruction must be an integer from 0 to 255");
  if (instruction) fault.instruction = numeric;
  if (cJSON_IsString(outcome) && strcmp(outcome->valuestring, "timeout") == 0) fault.outcome = Outcome::Timeout;
  else if (cJSON_IsString(outcome) && strcmp(outcome->valuestring, "response") == 0) fault.outcome = Outcome::Response;
  else return fail("invalid_fault", "outcome must be response or timeout");
  if (response && (!cJSON_IsString(response) || !unhex(response->valuestring, fault.response) ||
                   fault.response.size() > 250))
    return fail("invalid_fault", "response must be hexadecimal and at most 250 bytes");
  if (delay && !integer_value(delay, 0, UINT32_MAX, numeric))
    return fail("invalid_fault", "delayMs must be a non-negative integer");
  if (delay) fault.delay_ms = numeric;
  if (count && !integer_value(count, 1, UINT32_MAX, numeric))
    return fail("invalid_fault", "count must be a positive integer");
  if (count) fault.remaining = numeric;
  std::lock_guard<std::mutex> lock(state.mutex);
  state.behavior.set_fault(fault);
  return ok();
}

Reply set_overrides(EmulatorState &state, cJSON *arguments) {
  cJSON *rules = field(arguments, "rules");
  if (!cJSON_IsArray(rules)) return fail("invalid_override", "rules array required");
  std::vector<Override> parsed;
  cJSON *item = nullptr;
  cJSON_ArrayForEach(item, rules) {
    Override rule;
    cJSON *command = field(item, "command");
    cJSON *response = field(item, "response");
    cJSON *mask = field(item, "mask");
    cJSON *remaining = field(item, "count");
    cJSON *outcome = field(item, "outcome");
    if (!cJSON_IsString(command) || !unhex(command->valuestring, rule.command) || rule.command.size() > 250)
      return fail("invalid_override", "command must be hexadecimal and at most 250 bytes");
    if (response && !cJSON_IsString(response))
      return fail("invalid_override", "response must be hexadecimal when provided");
    if (cJSON_IsString(outcome) && strcmp(outcome->valuestring, "timeout") == 0) rule.result.outcome = Outcome::Timeout;
    else if (cJSON_IsString(outcome) && strcmp(outcome->valuestring, "removed") == 0) rule.result.outcome = Outcome::Removed;
    else if (outcome && (!cJSON_IsString(outcome) || strcmp(outcome->valuestring, "response") != 0))
      return fail("invalid_override", "outcome must be response, timeout or removed");
    if (rule.result.outcome == Outcome::Response &&
        (!cJSON_IsString(response) || !unhex(response->valuestring, rule.result.response) ||
         rule.result.response.size() > 250))
      return fail("invalid_override", "response outcome requires a hexadecimal response of at most 250 bytes");
    if (mask && !cJSON_IsString(mask))
      return fail("invalid_override", "mask must be hexadecimal when provided");
    if (cJSON_IsString(mask)) {
      Bytes parsed_mask;
      if (!unhex(mask->valuestring, parsed_mask) || parsed_mask.size() != rule.command.size())
        return fail("invalid_override", "mask must match command length");
      rule.mask = parsed_mask;
    }
    int64_t count_value = 0;
    if (remaining && !integer_value(remaining, 1, UINT32_MAX, count_value))
      return fail("invalid_override", "count must be a positive integer");
    if (remaining) rule.remaining = count_value;
    parsed.push_back(std::move(rule));
  }
  std::lock_guard<std::mutex> lock(state.mutex);
  state.behavior.set_overrides(std::move(parsed));
  return ok();
}

Reply set_removal(EmulatorState &state, cJSON *arguments) {
  RemovalPolicy policy;
  cJSON *milliseconds = field(arguments, "afterMs");
  cJSON *exchanges = field(arguments, "afterExchanges");
  cJSON *instruction = field(arguments, "afterInstruction");
  int64_t milliseconds_value = -1, exchanges_value = -1, instruction_value = -1;
  if (milliseconds && !integer_value(milliseconds, 1, UINT32_MAX, milliseconds_value))
    return fail("invalid_removal", "afterMs must be a positive integer");
  if (exchanges && !integer_value(exchanges, 1, UINT32_MAX, exchanges_value))
    return fail("invalid_removal", "afterExchanges must be a positive integer");
  if (instruction && !integer_value(instruction, 0, 255, instruction_value))
    return fail("invalid_removal", "afterInstruction must be an integer from 0 to 255");
  ApiValidationResult validation = validate_removal(milliseconds_value, exchanges_value, instruction_value);
  if (!validation.valid) return fail("invalid_removal", validation.message);
  if (milliseconds_value >= 0) policy.after_ms = milliseconds_value;
  if (exchanges_value >= 0) policy.after_exchanges = exchanges_value;
  if (instruction_value >= 0) policy.after_instruction = instruction_value;
  std::lock_guard<std::mutex> lock(state.mutex);
  state.behavior.set_removal(policy);
  return ok();
}

Reply present(EmulatorState &state) {
  std::unique_lock<std::mutex> lock(state.mutex);
  if (!state.active_profile) return fail("no_profile", "select a profile first");
  if (!state.present_requested) {
    state.behavior.begin_presentation();
    state.engine.reset_session();
    state.presentation_started_ms = esp_timer_get_time() / 1000;
  }
  state.present_requested = true;
  state.changed.notify_all();
  state.changed.wait_for(lock, std::chrono::seconds(2), [&] { return state.target_armed || state.rf_active; });
  if (!state.target_armed && !state.rf_active) {
    state.present_requested = false;
    state.changed.notify_all();
    state.changed.wait_for(lock, std::chrono::seconds(2), [&] {
      return !state.target_armed && !state.rf_active;
    });
    return fail("pn532_not_ready", "target command was not acknowledged");
  }
  bool active = state.rf_active;
  lock.unlock();
  cJSON *json = cJSON_CreateObject();
  cJSON_AddStringToObject(json, "state", active ? "rf-active" : "armed");
  return ok(json);
}

Reply remove(EmulatorState &state) {
  std::unique_lock<std::mutex> lock(state.mutex);
  state.present_requested = false;
  state.changed.notify_all();
  state.changed.wait_for(lock, std::chrono::seconds(2), [&] { return !state.target_armed && !state.rf_active; });
  if (state.target_armed || state.rf_active) return fail("pn532_not_ready", "target mode did not stop");
  return ok();
}

Reply reset(EmulatorState &state) {
  std::lock_guard<std::mutex> storage_lock(state.storage_mutex);
  std::lock_guard<std::mutex> lock(state.mutex);
  if (!state.active_profile) return fail("no_profile", "select a profile first");
  if (presenting(state))
    return fail("profile_presented", "remove the active profile before resetting it");
  CardProfile reset_profile = *state.active_profile;
  factory_reset(reset_profile);
  if (!state.profiles.save(reset_profile)) return fail("persist_failed", "factory reset was not persisted");
  state.active_profile = reset_profile;
  state.engine.reset_session();
  ++state.profile_revision;
  return ok(profile_json(reset_profile));
}

Reply trace(EmulatorState &state) {
  std::deque<TraceEntry> entries;
  {
    std::lock_guard<std::mutex> lock(state.mutex);
    entries = state.trace.entries();
  }
  cJSON *json = cJSON_CreateArray();
  for (const auto &entry : entries) {
    cJSON *item = cJSON_CreateObject();
    cJSON_AddNumberToObject(item, "timestampMs", entry.timestamp_ms);
    cJSON_AddNumberToObject(item, "durationMs", entry.duration_ms);
    cJSON_AddStringToObject(item, "commandDirection", "pcd-to-picc");
    cJSON_AddStringToObject(item, "command", hex(entry.command).c_str());
    cJSON_AddStringToObject(item, "responseDirection", "picc-to-pcd");
    cJSON_AddStringToObject(item, "response", hex(entry.response).c_str());
    cJSON_AddStringToObject(item, "outcome", outcome_name(entry.outcome));
    cJSON_AddStringToObject(item, "source", entry.source.c_str());
    cJSON_AddItemToArray(json, item);
  }
  return ok(json);
}

constexpr const char *command_names[] = {
    "help", "health", "status", "profiles.list", "profiles.create", "profiles.get",
    "profiles.update", "profiles.delete", "profiles.select", "scenario", "behavior.clear", "fault.set",
    "fault.clear", "overrides.set", "overrides.clear", "removal.set", "present",
    "remove", "reset", "trace.get", "trace.clear"};

}  // namespace

Reply run_command(EmulatorState &state, NvsStore &store, const std::string &command,
                  cJSON *arguments) {
  if (command == "help") {
    cJSON *json = cJSON_CreateArray();
    for (const char *name : command_names) cJSON_AddItemToArray(json, cJSON_CreateString(name));
    return ok(json);
  }
  if (command == "health") {
    cJSON *json = cJSON_CreateObject();
    cJSON_AddStringToObject(json, "status", "ok");
    return ok(json);
  }
  if (command == "status") return status(state);
  if (command == "profiles.list") return list_profiles(state, store);
  if (command == "profiles.create") return create_profile(state, arguments);
  if (command == "profiles.get") return get_profile(state, arguments);
  if (command == "profiles.update") return update_profile(state, arguments);
  if (command == "profiles.delete") return delete_profile(state, arguments);
  if (command == "profiles.select") return select_profile(state, arguments);
  if (command == "scenario") return set_scenario(state, arguments);
  if (command == "behavior.clear") {
    std::lock_guard<std::mutex> lock(state.mutex);
    state.behavior.clear();
    return ok();
  }
  if (command == "fault.set") return set_fault(state, arguments);
  if (command == "fault.clear") {
    std::lock_guard<std::mutex> lock(state.mutex);
    state.behavior.set_fault({});
    return ok();
  }
  if (command == "overrides.set") return set_overrides(state, arguments);
  if (command == "overrides.clear") {
    std::lock_guard<std::mutex> lock(state.mutex);
    state.behavior.set_overrides({});
    return ok();
  }
  if (command == "removal.set") return set_removal(state, arguments);
  if (command == "present") return present(state);
  if (command == "remove") return remove(state);
  if (command == "reset") return reset(state);
  if (command == "trace.get") return trace(state);
  if (command == "trace.clear") {
    std::lock_guard<std::mutex> lock(state.mutex);
    state.trace.clear();
    return ok();
  }
  return fail("unknown_command", "send help for the list of commands");
}

}  // namespace nfc_emulator
