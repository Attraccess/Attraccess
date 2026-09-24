#include "control_api.hpp"
#include "emulator.hpp"
#include "network.hpp"
#include "nvs_store.hpp"
#include "pn532_target.hpp"

#include "esp_log.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <algorithm>
#include <chrono>

namespace nfc_emulator {
namespace {
constexpr char tag[] = "nfc-emulator";

void emulator_task(void *argument) {
  auto &state = *static_cast<EmulatorState *>(argument);
  Pn532Target target;
  if (!target.begin()) {
    ESP_LOGE(tag, "PN532 I2C initialization failed");
    vTaskDelete(nullptr);
    return;
  }
  for (;;) {
    std::array<uint8_t, 4> uid{};
    bool stop_target = false;
    bool skip_iteration = false;
    {
      std::unique_lock<std::mutex> lock(state.mutex);
      state.changed.wait_for(lock, std::chrono::milliseconds(50), [&] {
        return state.present_requested || state.target_armed || state.rf_active;
      });
      if (!state.present_requested || !state.active_profile) {
        if (state.target_armed || state.rf_active) {
          stop_target = true;
        }
        skip_iteration = true;
      } else {
        uid = state.behavior.presentation_uid(*state.active_profile);
        uint64_t now = esp_timer_get_time() / 1000;
        if (state.behavior.should_remove(
                static_cast<uint32_t>(now - state.presentation_started_ms))) {
          state.present_requested = false;
          skip_iteration = true;
        }
      }
    }
    if (stop_target) {
      target.deactivate();
      std::lock_guard<std::mutex> lock(state.mutex);
      state.target_armed = false; state.rf_active = false;
      state.engine.reset_session(); state.changed.notify_all();
    }
    if (skip_iteration) continue;
    if (!target.active()) {
      bool needs_arm = false;
      {
        std::lock_guard<std::mutex> lock(state.mutex);
        needs_arm = !state.target_armed;
      }
      if (needs_arm) {
        if (!target.arm(uid)) {
          std::lock_guard<std::mutex> lock(state.mutex);
          state.target_armed = false; state.rf_active = false;
          state.engine.reset_session(); state.changed.notify_all();
          continue;
        }
        std::lock_guard<std::mutex> lock(state.mutex);
        state.target_armed = true;
        state.changed.notify_all();
      }
      if (!target.poll_activation(250)) {
        std::lock_guard<std::mutex> lock(state.mutex);
        state.target_armed = false; state.rf_active = false;
        state.engine.reset_session(); state.changed.notify_all();
        continue;
      }
      std::lock_guard<std::mutex> lock(state.mutex);
      state.target_armed = false; state.rf_active = true; state.changed.notify_all();
    }
    {
      std::lock_guard<std::mutex> lock(state.mutex);
      uint64_t now = esp_timer_get_time() / 1000;
      if (state.behavior.should_remove(static_cast<uint32_t>(now - state.presentation_started_ms))) {
        state.present_requested = false;
        continue;
      }
    }
    Bytes command;
    if (!target.receive(command, 1000)) {
      std::lock_guard<std::mutex> lock(state.mutex);
      state.target_armed = false; state.rf_active = false;
      state.engine.reset_session(); state.changed.notify_all();
      continue;
    }
    uint64_t started = esp_timer_get_time() / 1000;
    ExchangeResult result;
    CardProfile staged_profile;
    ProtocolEngine staged_engine;
    std::string profile_id;
    uint64_t profile_revision = 0;
    bool profile_changed = false;
    {
      std::lock_guard<std::mutex> lock(state.mutex);
      if (!state.active_profile) continue;
      staged_profile = *state.active_profile;
      staged_engine = state.engine;
      profile_id = staged_profile.id;
      profile_revision = state.profile_revision;
      Bytes before = encode_profile(staged_profile);
      result = state.behavior.exchange(staged_profile, command, staged_engine);
      profile_changed = encode_profile(staged_profile) != before;
    }
    bool persisted = true;
    bool state_matches = true;
    std::unique_lock<std::mutex> storage_lock(state.storage_mutex, std::defer_lock);
    if (profile_changed) {
      storage_lock.lock();
      {
        std::lock_guard<std::mutex> lock(state.mutex);
        state_matches = state.active_profile && state.active_profile->id == profile_id &&
                        state.profile_revision == profile_revision;
      }
      if (state_matches) persisted = state.profiles.save(staged_profile);
    }
    {
      std::lock_guard<std::mutex> lock(state.mutex);
      if (!state_matches || !state.active_profile || state.active_profile->id != profile_id ||
          state.profile_revision != profile_revision) {
        result = {Outcome::Removed, {}, 0, "runtime"};
      } else if (!persisted) {
        state.engine.reset_session();
        result = {Outcome::Error, {}, 0, "persistence"};
      } else {
        state.engine = std::move(staged_engine);
        if (profile_changed) {
          state.active_profile = std::move(staged_profile);
          ++state.profile_revision;
        }
      }
    }
    if (storage_lock.owns_lock()) storage_lock.unlock();
    for (uint32_t remaining = result.delay_ms; remaining > 0;) {
      const uint32_t slice = std::min<uint32_t>(remaining, 50);
      vTaskDelay(pdMS_TO_TICKS(slice));
      remaining -= slice;
      std::lock_guard<std::mutex> lock(state.mutex);
      if (!state.present_requested) {
        result = {Outcome::Removed, {}, 0, "runtime"};
        break;
      }
    }
    if (result.outcome == Outcome::Response && !target.respond(result.response)) {
      result = {Outcome::Error, {}, 0, "transport"};
      target.deactivate();
      std::lock_guard<std::mutex> lock(state.mutex);
      state.target_armed = false; state.rf_active = false;
      state.engine.reset_session(); state.changed.notify_all();
    }
    bool remove_target = false;
    {
      std::lock_guard<std::mutex> lock(state.mutex);
      state.trace.append({started, static_cast<uint32_t>(esp_timer_get_time() / 1000 - started),
                          command, result.response, result.outcome, result.source});
      uint64_t now = esp_timer_get_time() / 1000;
      if (result.outcome == Outcome::Removed ||
          state.behavior.should_remove(static_cast<uint32_t>(now - state.presentation_started_ms))) {
        state.present_requested = false; remove_target = true;
      }
    }
    if (remove_target) {
      target.deactivate();
      std::lock_guard<std::mutex> lock(state.mutex);
      state.target_armed = false; state.rf_active = false;
      state.engine.reset_session(); state.changed.notify_all();
    }
  }
}
}  // namespace
}  // namespace nfc_emulator

extern "C" void app_main() {
  using namespace nfc_emulator;
  esp_err_t nvs = nvs_flash_init();
  if (nvs == ESP_ERR_NVS_NO_FREE_PAGES || nvs == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    nvs_flash_erase(); nvs = nvs_flash_init();
  }
  ESP_ERROR_CHECK(nvs);
  static NvsStore store;
  static EmulatorState state(store);
  ProvisioningConfig provisioning;
  if (store.load_provisioning(provisioning)) state.token = provisioning.token;
  state.engine = ProtocolEngine([](uint8_t *output, size_t size) { esp_fill_random(output, size); });
  start_serial_provisioning(store);
  ESP_ERROR_CHECK(start_network(store) ? ESP_OK : ESP_FAIL);
  ESP_ERROR_CHECK(start_control_api(state, store) ? ESP_OK : ESP_FAIL);
  xTaskCreate(emulator_task, "nfc-emulator", 8192, &state, 8, nullptr);
}
