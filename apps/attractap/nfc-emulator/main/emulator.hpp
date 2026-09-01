#pragma once

#include "nfc_emulator/behavior.hpp"
#include "nfc_emulator/persistence.hpp"
#include "nfc_emulator/trace.hpp"

#include <mutex>
#include <condition_variable>
#include <optional>

namespace nfc_emulator {

struct EmulatorState {
  explicit EmulatorState(BlobStore &blobs) : profiles(blobs) {}
  std::mutex mutex;
  std::mutex storage_mutex;
  std::condition_variable changed;
  ProfileRepository profiles;
  std::optional<CardProfile> active_profile;
  uint64_t profile_revision = 0;
  ProtocolEngine engine;
  BehaviorController behavior;
  TraceLog trace{128};
  bool present_requested = false;
  bool target_armed = false;
  bool rf_active = false;
  uint64_t presentation_started_ms = 0;
  std::string token;
};

}  // namespace nfc_emulator
