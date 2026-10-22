#include "control_api.hpp"
#include "nfc_emulator/api_validation.hpp"

#include "cJSON.h"
#include "esp_http_server.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <chrono>
#include <algorithm>
#include <cmath>
#include <cstring>

namespace nfc_emulator {
namespace {
struct Context { EmulatorState *state; NvsStore *store; };

esp_err_t json_response(httpd_req_t *request, int status, cJSON *json) {
  const char *status_text = status == 200 ? "200 OK" : status == 201 ? "201 Created" :
                            status == 400 ? "400 Bad Request" : status == 401 ? "401 Unauthorized" :
                            status == 404 ? "404 Not Found" : status == 409 ? "409 Conflict" :
                            status == 503 ? "503 Service Unavailable" : "500 Internal Server Error";
  httpd_resp_set_status(request, status_text);
  httpd_resp_set_type(request, "application/json");
  char *body = cJSON_PrintUnformatted(json);
  esp_err_t result = httpd_resp_sendstr(request, body ? body : "{}");
  cJSON_free(body);
  cJSON_Delete(json);
  return result;
}

esp_err_t error(httpd_req_t *request, int status, const char *code, const char *message) {
  cJSON *json = cJSON_CreateObject();
  cJSON_AddStringToObject(json, "error", code);
  cJSON_AddStringToObject(json, "message", message);
  return json_response(request, status, json);
}

cJSON *read_body(httpd_req_t *request) {
  if (request->content_len <= 0 || request->content_len > 4096) return nullptr;
  std::vector<char> buffer(request->content_len + 1);
  size_t received = 0;
  while (received < static_cast<size_t>(request->content_len)) {
    int result = httpd_req_recv(request, buffer.data() + received,
                                request->content_len - received);
    if (result <= 0) return nullptr;
    received += result;
  }
  return cJSON_Parse(buffer.data());
}

bool authorized(httpd_req_t *request, const std::string &token) {
  if (token.empty()) return false;
  size_t length = httpd_req_get_hdr_value_len(request, "Authorization");
  if (length != token.size() + 7) return false;
  std::vector<char> value(length + 1);
  if (httpd_req_get_hdr_value_str(request, "Authorization", value.data(), value.size()) != ESP_OK)
    return false;
  std::string expected = "Bearer " + token;
  uint8_t difference = 0;
  for (size_t i = 0; i < expected.size(); ++i) difference |= value[i] ^ expected[i];
  return difference == 0;
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
  cJSON *id = cJSON_GetObjectItemCaseSensitive(json, "id");
  cJSON *type = cJSON_GetObjectItemCaseSensitive(json, "type");
  cJSON *uid = cJSON_GetObjectItemCaseSensitive(json, "uid");
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
  cJSON *app = cJSON_GetObjectItemCaseSensitive(json, "attraccessApp");
  if (app && !cJSON_IsBool(app)) { message = "attraccessApp must be boolean"; return false; }
  if (cJSON_IsBool(app)) profile.state.attraccess_app = cJSON_IsTrue(app);
  cJSON *active = cJSON_GetObjectItemCaseSensitive(json, "active");
  if (active && !cJSON_IsBool(active)) { message = "active must be boolean"; return false; }
  if (cJSON_IsBool(active)) profile.state.active = cJSON_IsTrue(active);
  cJSON *ndef = cJSON_GetObjectItemCaseSensitive(json, "ndef");
  if (ndef && !cJSON_IsString(ndef)) { message = "ndef must be hexadecimal"; return false; }
  if (cJSON_IsString(ndef) && !unhex(ndef->valuestring, profile.state.ndef)) {
    message = "ndef must be hexadecimal"; return false;
  }
  cJSON *keys = cJSON_GetObjectItemCaseSensitive(json, "keys");
  if (keys && !cJSON_IsArray(keys)) { message = "keys must be an array"; return false; }
  std::array<bool, 6> seen_keys{};
  cJSON *item = nullptr;
  cJSON_ArrayForEach(item, keys) {
    cJSON *number = cJSON_GetObjectItemCaseSensitive(item, "number");
    cJSON *version = cJSON_GetObjectItemCaseSensitive(item, "version");
    cJSON *value = cJSON_GetObjectItemCaseSensitive(item, "value");
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

esp_err_t provision(httpd_req_t *request, Context &context) {
  cJSON *body = read_body(request);
  if (!body) return error(request, 400, "invalid_json", "valid JSON body required");
  cJSON *ssid = cJSON_GetObjectItemCaseSensitive(body, "ssid");
  cJSON *password = cJSON_GetObjectItemCaseSensitive(body, "password");
  cJSON *token = cJSON_GetObjectItemCaseSensitive(body, "token");
  if (!cJSON_IsString(ssid) || !cJSON_IsString(password) || !cJSON_IsString(token)) {
    cJSON_Delete(body);
    return error(request, 400, "invalid_provisioning", "ssid, password and token strings are required");
  }
  ApiValidationResult validation = validate_provisioning(ssid->valuestring, password->valuestring,
                                                          token->valuestring);
  if (!validation.valid) { cJSON_Delete(body); return error(request, 400, "invalid_provisioning", validation.message); }
  ProvisioningConfig config{ssid->valuestring, password->valuestring, token->valuestring};
  bool saved;
  {
    std::lock_guard<std::mutex> storage_lock(context.state->storage_mutex);
    saved = context.store->save_provisioning(config);
  }
  cJSON_Delete(body);
  if (!saved) return error(request, 500, "nvs_write_failed", "provisioning was not persisted");
  cJSON *response = cJSON_CreateObject(); cJSON_AddBoolToObject(response, "restarting", true);
  json_response(request, 200, response);
  vTaskDelay(pdMS_TO_TICKS(100)); esp_restart(); return ESP_OK;
}

esp_err_t handle(httpd_req_t *request) {
  auto &context = *static_cast<Context *>(request->user_ctx);
  std::string path(request->uri);
  if (path == "/provision" && request->method == HTTP_POST) {
    if (!context.state->token.empty() && !authorized(request, context.state->token))
      return error(request, 401, "unauthorized", "bearer token required to reprovision");
    return provision(request, context);
  }
  if (!authorized(request, context.state->token))
    return error(request, context.state->token.empty() ? 503 : 401,
                 "unauthorized", "provisioned bearer token required");

  if (path == "/health" && request->method == HTTP_GET) {
    cJSON *json = cJSON_CreateObject(); cJSON_AddStringToObject(json, "status", "ok");
    return json_response(request, 200, json);
  }
  if ((path == "/status" || path == "/state") && request->method == HTTP_GET) {
    bool requested, armed, active;
    std::optional<CardProfile> profile;
    {
      std::lock_guard<std::mutex> lock(context.state->mutex);
      requested = context.state->present_requested;
      armed = context.state->target_armed;
      active = context.state->rf_active;
      profile = context.state->active_profile;
    }
    cJSON *json = cJSON_CreateObject();
    cJSON_AddBoolToObject(json, "presentRequested", requested);
    cJSON_AddBoolToObject(json, "targetArmed", armed);
    cJSON_AddBoolToObject(json, "rfActive", active);
    if (profile) cJSON_AddItemToObject(json, "profile", profile_json(*profile));
    else cJSON_AddNullToObject(json, "profile");
    return json_response(request, 200, json);
  }
  if (path == "/profiles" && request->method == HTTP_GET) {
    std::vector<CardProfile> profiles;
    {
      std::lock_guard<std::mutex> storage_lock(context.state->storage_mutex);
      if (!context.store->list_profiles(profiles))
        return error(request, 500, "persist_failed", "profiles could not be enumerated");
    }
    std::sort(profiles.begin(), profiles.end(),
              [](const CardProfile &left, const CardProfile &right) {
                return left.id < right.id;
              });
    cJSON *json = cJSON_CreateArray();
    for (const auto &profile : profiles) cJSON_AddItemToArray(json, profile_json(profile));
    return json_response(request, 200, json);
  }
  if (path == "/profiles" && request->method == HTTP_POST) {
    cJSON *body = read_body(request); CardProfile profile; std::string message;
    if (!body) return error(request, 400, "invalid_json", "valid JSON body required");
    if (!profile_from_json(body, profile, message)) { cJSON_Delete(body); return error(request, 400, "invalid_profile", message.c_str()); }
    cJSON_Delete(body);
    std::lock_guard<std::mutex> storage_lock(context.state->storage_mutex);
    CardProfile existing;
    if (context.state->profiles.load(profile.id, existing))
      return error(request, 409, "profile_exists", "use PUT to replace an existing profile");
    if (!context.state->profiles.save(profile)) return error(request, 500, "persist_failed", "profile was not saved");
    return json_response(request, 201, profile_json(profile));
  }
  if (path.rfind("/profiles/", 0) == 0) {
    std::string id = path.substr(10); CardProfile profile;
    if (request->method == HTTP_GET) {
      std::lock_guard<std::mutex> storage_lock(context.state->storage_mutex);
      if (!context.state->profiles.load(id, profile)) return error(request, 404, "not_found", "profile not found");
      return json_response(request, 200, profile_json(profile));
    }
    if (request->method == HTTP_DELETE) {
      std::lock_guard<std::mutex> storage_lock(context.state->storage_mutex);
      if (!context.state->profiles.load(id, profile)) return error(request, 404, "not_found", "profile not found");
      std::unique_lock<std::mutex> lock(context.state->mutex);
      bool affects_active = context.state->active_profile &&
          context.state->active_profile->id == id;
      bool active_presentation = affects_active &&
          (context.state->present_requested || context.state->target_armed || context.state->rf_active);
      if (active_presentation) return error(request,409,"profile_presented","remove the active profile before deleting it");
      if (!affects_active) lock.unlock();
      if (!context.state->profiles.remove(id)) return error(request, 500, "persist_failed", "profile was not deleted");
      if (affects_active) {
        context.state->present_requested = false;
        context.state->active_profile.reset();
        context.state->engine.reset_session();
        ++context.state->profile_revision;
        context.state->changed.notify_all();
      }
      return json_response(request, 200, cJSON_CreateObject());
    }
    if (request->method == HTTP_PUT) {
      cJSON *body = read_body(request); std::string message;
      if (!body) return error(request, 400, "invalid_json", "valid JSON body required");
      if (!profile_from_json(body, profile, message)) { cJSON_Delete(body); return error(request, 400, "invalid_profile", message.c_str()); }
      if (profile.id != id) { cJSON_Delete(body); return error(request, 400, "id_mismatch", "body id must match path"); }
      cJSON_Delete(body);
      std::lock_guard<std::mutex> storage_lock(context.state->storage_mutex);
      CardProfile existing;
      if (!context.state->profiles.load(id, existing)) return error(request, 404, "not_found", "profile not found");
      std::unique_lock<std::mutex> lock(context.state->mutex);
      bool affects_active = context.state->active_profile &&
          context.state->active_profile->id == id;
      bool active_presentation = affects_active &&
          (context.state->present_requested || context.state->target_armed || context.state->rf_active);
      if (active_presentation) return error(request,409,"profile_presented","remove the active profile before replacing it");
      if (!affects_active) lock.unlock();
      if (!context.state->profiles.save(profile)) return error(request, 500, "persist_failed", "profile was not replaced");
      if (affects_active) {
        context.state->active_profile = profile;
        context.state->engine.reset_session();
        ++context.state->profile_revision;
      }
      return json_response(request, 200, profile_json(profile));
    }
  }
  if (path == "/profiles/select" && request->method == HTTP_POST) {
    cJSON *body = read_body(request); cJSON *id = body ? cJSON_GetObjectItemCaseSensitive(body, "id") : nullptr; CardProfile profile;
    if (!cJSON_IsString(id)) { cJSON_Delete(body); return error(request, 400, "invalid_request", "id string is required"); }
    std::lock_guard<std::mutex> storage_lock(context.state->storage_mutex);
    if (!context.state->profiles.load(id->valuestring, profile)) { cJSON_Delete(body); return error(request, 404, "not_found", "profile not found"); }
    cJSON_Delete(body);
    std::lock_guard<std::mutex> lock(context.state->mutex);
    bool active_presentation = context.state->present_requested || context.state->target_armed || context.state->rf_active;
    if(active_presentation)return error(request,409,"profile_presented","remove the current profile before selecting another");
    context.state->present_requested = false;
    context.state->active_profile = profile;
    context.state->engine.reset_session();
    ++context.state->profile_revision;
    context.state->changed.notify_all();
    return json_response(request, 200, profile_json(profile));
  }
  if (path == "/scenario" && request->method == HTTP_POST) {
    cJSON *body = read_body(request); cJSON *name = body ? cJSON_GetObjectItemCaseSensitive(body, "name") : nullptr; Scenario scenario;
    if (!cJSON_IsString(name) || !parse_scenario(name->valuestring, scenario)) { cJSON_Delete(body); return error(request, 400, "invalid_scenario", "unknown scenario name"); }
    cJSON_Delete(body); { std::lock_guard<std::mutex> lock(context.state->mutex); context.state->behavior.set_scenario(scenario); }
    return json_response(request, 200, cJSON_CreateObject());
  }
  if (path == "/fault" && request->method == HTTP_DELETE) { { std::lock_guard<std::mutex> lock(context.state->mutex); context.state->behavior.set_fault({}); } return json_response(request, 200, cJSON_CreateObject()); }
  if (path == "/fault" && request->method == HTTP_POST) {
    cJSON *body = read_body(request); Fault fault;
    cJSON *instruction = body ? cJSON_GetObjectItemCaseSensitive(body, "instruction") : nullptr;
    cJSON *outcome = body ? cJSON_GetObjectItemCaseSensitive(body, "outcome") : nullptr;
    cJSON *response = body ? cJSON_GetObjectItemCaseSensitive(body, "response") : nullptr;
    cJSON *delay = body ? cJSON_GetObjectItemCaseSensitive(body, "delayMs") : nullptr;
    cJSON *count = body ? cJSON_GetObjectItemCaseSensitive(body, "count") : nullptr;
    int64_t numeric = 0;
    if (instruction && !integer_value(instruction, 0, 255, numeric)) { cJSON_Delete(body); return error(request,400,"invalid_fault","instruction must be an integer from 0 to 255"); }
    if (instruction) fault.instruction = numeric;
    if (cJSON_IsString(outcome) && strcmp(outcome->valuestring, "timeout") == 0) fault.outcome = Outcome::Timeout;
    else if (cJSON_IsString(outcome) && strcmp(outcome->valuestring, "response") == 0) fault.outcome = Outcome::Response;
    else { cJSON_Delete(body); return error(request, 400, "invalid_fault", "outcome must be response or timeout"); }
    if (response && (!cJSON_IsString(response) || !unhex(response->valuestring, fault.response) || fault.response.size() > 250)) { cJSON_Delete(body); return error(request, 400, "invalid_fault", "response must be hexadecimal and at most 250 bytes"); }
    if (delay && !integer_value(delay, 0, UINT32_MAX, numeric)) { cJSON_Delete(body); return error(request,400,"invalid_fault","delayMs must be a non-negative integer"); }
    if (delay) fault.delay_ms = numeric;
    if (count && !integer_value(count, 1, UINT32_MAX, numeric)) { cJSON_Delete(body); return error(request,400,"invalid_fault","count must be a positive integer"); }
    if (count) fault.remaining = numeric;
    cJSON_Delete(body); { std::lock_guard<std::mutex> lock(context.state->mutex); context.state->behavior.set_fault(fault); }
    return json_response(request, 200, cJSON_CreateObject());
  }
  if (path == "/overrides" && request->method == HTTP_DELETE) { { std::lock_guard<std::mutex> lock(context.state->mutex); context.state->behavior.set_overrides({}); } return json_response(request, 200, cJSON_CreateObject()); }
  if (path == "/overrides" && request->method == HTTP_POST) {
    cJSON *body = read_body(request); cJSON *rules = body ? cJSON_GetObjectItemCaseSensitive(body, "rules") : nullptr; std::vector<Override> parsed; cJSON *item = nullptr;
    cJSON_ArrayForEach(item, rules) { Override rule; cJSON *command = cJSON_GetObjectItemCaseSensitive(item,"command"); cJSON *response = cJSON_GetObjectItemCaseSensitive(item,"response"); cJSON *mask = cJSON_GetObjectItemCaseSensitive(item,"mask"); cJSON *remaining = cJSON_GetObjectItemCaseSensitive(item,"count"); cJSON *outcome = cJSON_GetObjectItemCaseSensitive(item,"outcome");
      if (!cJSON_IsString(command) || !unhex(command->valuestring,rule.command) || rule.command.size()>250) { cJSON_Delete(body); return error(request,400,"invalid_override","command must be hexadecimal and at most 250 bytes"); }
      if (response && !cJSON_IsString(response)) { cJSON_Delete(body); return error(request,400,"invalid_override","response must be hexadecimal when provided"); }
      if (cJSON_IsString(outcome) && strcmp(outcome->valuestring,"timeout")==0) rule.result.outcome=Outcome::Timeout;
      else if (cJSON_IsString(outcome) && strcmp(outcome->valuestring,"removed")==0) rule.result.outcome=Outcome::Removed;
      else if (outcome && (!cJSON_IsString(outcome) || strcmp(outcome->valuestring,"response")!=0)) { cJSON_Delete(body); return error(request,400,"invalid_override","outcome must be response, timeout or removed"); }
      if (rule.result.outcome==Outcome::Response && (!cJSON_IsString(response) || !unhex(response->valuestring,rule.result.response) || rule.result.response.size()>250)) { cJSON_Delete(body); return error(request,400,"invalid_override","response outcome requires a hexadecimal response of at most 250 bytes"); }
      if (mask && !cJSON_IsString(mask)) { cJSON_Delete(body); return error(request,400,"invalid_override","mask must be hexadecimal when provided"); }
      if (cJSON_IsString(mask)) { Bytes parsed_mask; if (!unhex(mask->valuestring,parsed_mask) || parsed_mask.size()!=rule.command.size()) { cJSON_Delete(body); return error(request,400,"invalid_override","mask must match command length"); } rule.mask=parsed_mask; }
      int64_t count_value=0; if(remaining&&!integer_value(remaining,1,UINT32_MAX,count_value)){cJSON_Delete(body);return error(request,400,"invalid_override","count must be a positive integer");} if(remaining)rule.remaining=count_value; parsed.push_back(std::move(rule)); }
    if (!cJSON_IsArray(rules)) { cJSON_Delete(body); return error(request,400,"invalid_override","rules array required"); }
    cJSON_Delete(body); { std::lock_guard<std::mutex> lock(context.state->mutex); context.state->behavior.set_overrides(std::move(parsed)); } return json_response(request,200,cJSON_CreateObject());
  }
  if (path == "/removal" && request->method == HTTP_POST) {
    cJSON *body = read_body(request); RemovalPolicy policy;
    cJSON *milliseconds = body ? cJSON_GetObjectItemCaseSensitive(body, "afterMs") : nullptr;
    cJSON *exchanges = body ? cJSON_GetObjectItemCaseSensitive(body, "afterExchanges") : nullptr;
    cJSON *instruction = body ? cJSON_GetObjectItemCaseSensitive(body, "afterInstruction") : nullptr;
    int64_t milliseconds_value=-1, exchanges_value=-1, instruction_value=-1;
    if(milliseconds&&!integer_value(milliseconds,1,UINT32_MAX,milliseconds_value)){cJSON_Delete(body);return error(request,400,"invalid_removal","afterMs must be a positive integer");}
    if(exchanges&&!integer_value(exchanges,1,UINT32_MAX,exchanges_value)){cJSON_Delete(body);return error(request,400,"invalid_removal","afterExchanges must be a positive integer");}
    if(instruction&&!integer_value(instruction,0,255,instruction_value)){cJSON_Delete(body);return error(request,400,"invalid_removal","afterInstruction must be an integer from 0 to 255");}
    ApiValidationResult validation = validate_removal(milliseconds_value, exchanges_value, instruction_value);
    if (!body || !validation.valid) { cJSON_Delete(body); return error(request,400,"invalid_removal",validation.message); }
    if (milliseconds_value >= 0) policy.after_ms = milliseconds_value;
    if (exchanges_value >= 0) policy.after_exchanges = exchanges_value;
    if (instruction_value >= 0) policy.after_instruction = instruction_value;
    cJSON_Delete(body); { std::lock_guard<std::mutex> lock(context.state->mutex); context.state->behavior.set_removal(policy); } return json_response(request,200,cJSON_CreateObject());
  }
  if (path == "/present" && request->method == HTTP_POST) {
    std::unique_lock<std::mutex> lock(context.state->mutex);
    if (!context.state->active_profile) { lock.unlock(); return error(request, 409, "no_profile", "select a profile first"); }
    if (!context.state->present_requested) {
      context.state->behavior.begin_presentation();
      context.state->engine.reset_session();
      context.state->presentation_started_ms = esp_timer_get_time() / 1000;
    }
    context.state->present_requested = true;
    context.state->changed.notify_all();
    context.state->changed.wait_for(lock, std::chrono::seconds(2), [&]{ return context.state->target_armed || context.state->rf_active; });
    if (!context.state->target_armed && !context.state->rf_active) {
      context.state->present_requested = false;
      context.state->changed.notify_all();
      context.state->changed.wait_for(lock, std::chrono::seconds(2), [&]{
        return !context.state->target_armed && !context.state->rf_active;
      });
      lock.unlock();
      return error(request, 503, "pn532_not_ready", "target command was not acknowledged");
    }
    bool active = context.state->rf_active;
    lock.unlock();
    cJSON *json = cJSON_CreateObject(); cJSON_AddStringToObject(json, "state", active ? "rf-active" : "armed");
    return json_response(request, 200, json);
  }
  if (path == "/remove" && request->method == HTTP_POST) {
    std::unique_lock<std::mutex> lock(context.state->mutex);
    context.state->present_requested = false;
    context.state->changed.notify_all();
    context.state->changed.wait_for(lock, std::chrono::seconds(2), [&]{ return !context.state->target_armed && !context.state->rf_active; });
    if (context.state->target_armed || context.state->rf_active) { lock.unlock(); return error(request,503,"pn532_not_ready","target mode did not stop"); }
    lock.unlock(); return json_response(request,200,cJSON_CreateObject());
  }
  if (path == "/reset" && request->method == HTTP_POST) {
    std::lock_guard<std::mutex> storage_lock(context.state->storage_mutex);
    std::lock_guard<std::mutex> lock(context.state->mutex);
    if (!context.state->active_profile) return error(request,409,"no_profile","select a profile first");
    bool active_presentation = context.state->present_requested ||
        context.state->target_armed || context.state->rf_active;
    if (active_presentation) return error(request,409,"profile_presented","remove the active profile before resetting it");
    CardProfile reset_profile = *context.state->active_profile;
    factory_reset(reset_profile);
    if(!context.state->profiles.save(reset_profile))return error(request,500,"persist_failed","factory reset was not persisted");
    context.state->active_profile=reset_profile;
    context.state->engine.reset_session();
    ++context.state->profile_revision;
    return json_response(request,200,profile_json(reset_profile));
  }
  if (path == "/trace" && request->method == HTTP_DELETE) { { std::lock_guard<std::mutex> lock(context.state->mutex); context.state->trace.clear(); } return json_response(request,200,cJSON_CreateObject()); }
  if (path == "/trace" && request->method == HTTP_GET) {
    std::deque<TraceEntry> entries; { std::lock_guard<std::mutex> lock(context.state->mutex); entries=context.state->trace.entries(); }
    cJSON *json=cJSON_CreateArray(); for(const auto &entry:entries){cJSON *item=cJSON_CreateObject();cJSON_AddNumberToObject(item,"timestampMs",entry.timestamp_ms);cJSON_AddNumberToObject(item,"durationMs",entry.duration_ms);cJSON_AddStringToObject(item,"commandDirection","pcd-to-picc");cJSON_AddStringToObject(item,"command",hex(entry.command).c_str());cJSON_AddStringToObject(item,"responseDirection","picc-to-pcd");cJSON_AddStringToObject(item,"response",hex(entry.response).c_str());cJSON_AddStringToObject(item,"outcome",outcome_name(entry.outcome));cJSON_AddStringToObject(item,"source",entry.source.c_str());cJSON_AddItemToArray(json,item);} return json_response(request,200,json);
  }
  return error(request, 404, "not_found", "unknown endpoint");
}
}  // namespace

bool start_control_api(EmulatorState &state, NvsStore &store) {
  static Context context{&state, &store};
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.uri_match_fn = httpd_uri_match_wildcard;
  config.max_uri_handlers = 8;
  httpd_handle_t server = nullptr;
  if (httpd_start(&server, &config) != ESP_OK) return false;
  static const httpd_method_t methods[] = {HTTP_GET, HTTP_POST, HTTP_PUT, HTTP_DELETE};
  for (httpd_method_t method : methods) {
    httpd_uri_t uri{"/*", method, handle, &context, false};
    if (httpd_register_uri_handler(server, &uri) != ESP_OK) return false;
  }
  return true;
}

}  // namespace nfc_emulator
