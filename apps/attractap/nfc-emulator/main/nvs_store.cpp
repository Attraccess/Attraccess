#include "nvs_store.hpp"

#include "nvs.h"

#include <array>
#include <cstdio>
#include <cstring>

namespace nfc_emulator {

NvsStore::NvsStore(const char *name_space) : namespace_(name_space) {}

std::string NvsStore::nvs_key(const std::string &key) {
  // NVS keys are limited to 15 characters; the profile ID remains inside the
  // checksummed blob, so a stable hash is safe and collisions are detected.
  if (key == "provisioning") return "provisioning";
  uint32_t hash = 2166136261U;
  for (uint8_t byte : key) hash = (hash ^ byte) * 16777619U;
  char result[16];
  snprintf(result, sizeof(result), "p%08lx", static_cast<unsigned long>(hash));
  return result;
}

bool NvsStore::put(const std::string &key, const Bytes &value) {
  nvs_handle_t handle;
  if (nvs_open(namespace_.c_str(), NVS_READWRITE, &handle) != ESP_OK) return false;
  const std::string physical_key = nvs_key(key);
  size_t existing_size = 0;
  esp_err_t result = nvs_get_blob(handle, physical_key.c_str(), nullptr, &existing_size);
  if (result != ESP_OK && result != ESP_ERR_NVS_NOT_FOUND) {
    nvs_close(handle);
    return false;
  }
  if (result == ESP_OK && existing_size > 0) {
    Bytes existing(existing_size);
    result = nvs_get_blob(handle, physical_key.c_str(), existing.data(), &existing_size);
    if (result != ESP_OK) { nvs_close(handle); return false; }
    CardProfile old_profile, new_profile;
    if (result == ESP_OK && decode_profile(existing, old_profile) &&
        decode_profile(value, new_profile) && old_profile.id != new_profile.id) {
      nvs_close(handle);
      return false;
    }
  }
  result = nvs_set_blob(handle, physical_key.c_str(), value.data(), value.size());
  if (result == ESP_OK) result = nvs_commit(handle);
  nvs_close(handle);
  return result == ESP_OK;
}

bool NvsStore::get(const std::string &key, Bytes &value) const {
  nvs_handle_t handle;
  if (nvs_open(namespace_.c_str(), NVS_READONLY, &handle) != ESP_OK) return false;
  size_t size = 0;
  esp_err_t result = nvs_get_blob(handle, nvs_key(key).c_str(), nullptr, &size);
  if (result == ESP_OK) {
    value.resize(size);
    result = nvs_get_blob(handle, nvs_key(key).c_str(), value.data(), &size);
  }
  nvs_close(handle);
  return result == ESP_OK;
}

bool NvsStore::erase(const std::string &key) {
  nvs_handle_t handle;
  if (nvs_open(namespace_.c_str(), NVS_READWRITE, &handle) != ESP_OK) return false;
  esp_err_t result = nvs_erase_key(handle, nvs_key(key).c_str());
  if (result == ESP_OK) result = nvs_commit(handle);
  nvs_close(handle);
  return result == ESP_OK;
}

bool NvsStore::save_provisioning(const ProvisioningConfig &config) {
  return put("provisioning", encode_provisioning(config));
}

bool NvsStore::load_provisioning(ProvisioningConfig &config) const {
  Bytes bytes;
  return get("provisioning", bytes) && decode_provisioning(bytes, config);
}

bool NvsStore::list_profiles(std::vector<CardProfile> &profiles) const {
  profiles.clear();
  nvs_iterator_t iterator = nullptr;
  esp_err_t result = nvs_entry_find("nvs", namespace_.c_str(), NVS_TYPE_BLOB, &iterator);
  while (result == ESP_OK && iterator != nullptr) {
    nvs_entry_info_t info{};
    if (nvs_entry_info(iterator, &info) != ESP_OK) {
      nvs_release_iterator(iterator);
      return false;
    }
    nvs_handle_t handle;
    if (nvs_open(namespace_.c_str(), NVS_READONLY, &handle) != ESP_OK) {
      nvs_release_iterator(iterator);
      return false;
    }
    size_t size = 0;
    if (nvs_get_blob(handle, info.key, nullptr, &size) == ESP_OK) {
      Bytes bytes(size);
      if (nvs_get_blob(handle, info.key, bytes.data(), &size) != ESP_OK) {
        nvs_close(handle); nvs_release_iterator(iterator); return false;
      }
      CardProfile profile;
      if (decode_profile(bytes, profile)) profiles.push_back(std::move(profile));
      else if (strcmp(info.key, "provisioning") != 0) {
        nvs_close(handle);
        nvs_release_iterator(iterator);
        return false;
      }
    } else {
      nvs_close(handle);
      nvs_release_iterator(iterator);
      return false;
    }
    nvs_close(handle);
    result = nvs_entry_next(&iterator);
  }
  nvs_release_iterator(iterator);
  return result == ESP_ERR_NVS_NOT_FOUND;
}

}  // namespace nfc_emulator
