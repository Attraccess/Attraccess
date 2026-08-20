#pragma once

#include "nfc_emulator/model.hpp"

#include <map>

namespace nfc_emulator {

class BlobStore {
 public:
  virtual ~BlobStore() = default;
  virtual bool put(const std::string &key, const Bytes &value) = 0;
  virtual bool get(const std::string &key, Bytes &value) const = 0;
  virtual bool erase(const std::string &key) = 0;
};

class MemoryBlobStore final : public BlobStore {
 public:
  bool put(const std::string &key, const Bytes &value) override;
  bool get(const std::string &key, Bytes &value) const override;
  bool erase(const std::string &key) override;

 private:
  std::map<std::string, Bytes> values_;
};

Bytes encode_profile(const CardProfile &profile);
bool decode_profile(const Bytes &bytes, CardProfile &profile);

struct ProvisioningConfig {
  std::string ssid;
  std::string password;
  std::string token;
};

Bytes encode_provisioning(const ProvisioningConfig &config);
bool decode_provisioning(const Bytes &bytes, ProvisioningConfig &config);

class ProfileRepository {
 public:
  explicit ProfileRepository(BlobStore &store) : store_(store) {}
  bool save(const CardProfile &profile);
  bool load(const std::string &id, CardProfile &profile) const;
  bool remove(const std::string &id);

 private:
  BlobStore &store_;
};

bool persist_profile_change(ProfileRepository &repository, CardProfile &current,
                            const CardProfile &candidate);

}  // namespace nfc_emulator
