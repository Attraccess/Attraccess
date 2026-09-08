#pragma once

#include "nfc_emulator/persistence.hpp"

namespace nfc_emulator {

class NvsStore final : public BlobStore {
 public:
  explicit NvsStore(const char *name_space = "nfcemu");
  bool put(const std::string &key, const Bytes &value) override;
  bool get(const std::string &key, Bytes &value) const override;
  bool erase(const std::string &key) override;
  bool save_provisioning(const ProvisioningConfig &config);
  bool load_provisioning(ProvisioningConfig &config) const;
  bool list_profiles(std::vector<CardProfile> &profiles) const;

 private:
  std::string namespace_;
  static std::string nvs_key(const std::string &key);
};

}  // namespace nfc_emulator
