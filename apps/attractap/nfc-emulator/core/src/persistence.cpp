#include "nfc_emulator/persistence.hpp"

#include "nfc_emulator/crypto.hpp"

#include <algorithm>
#include <cstring>

namespace nfc_emulator {
namespace {
constexpr uint8_t version = 1;

void append(Bytes &out, const void *data, size_t size) {
  const auto *bytes = static_cast<const uint8_t *>(data);
  out.insert(out.end(), bytes, bytes + size);
}

void append_state(Bytes &out, const CardState &state) {
  out.push_back(state.active);
  out.push_back(state.attraccess_app);
  for (const auto &key : state.keys) {
    append(out, key.value.data(), key.value.size());
    out.push_back(key.version);
  }
  uint16_t size = static_cast<uint16_t>(state.ndef.size());
  append(out, &size, sizeof(size));
  append(out, state.ndef.data(), state.ndef.size());
}

bool read_state(const Bytes &in, size_t &offset, CardState &state) {
  constexpr size_t fixed = 2 + 6 * 17 + 2;
  if (offset + fixed > in.size()) return false;
  state.active = in[offset++] != 0;
  state.attraccess_app = in[offset++] != 0;
  for (auto &key : state.keys) {
    std::copy_n(in.begin() + offset, 16, key.value.begin());
    offset += 16;
    key.version = in[offset++];
  }
  uint16_t size = 0;
  std::memcpy(&size, in.data() + offset, sizeof(size));
  offset += sizeof(size);
  if (offset + size > in.size() || size > 1024) return false;
  state.ndef.assign(in.begin() + offset, in.begin() + offset + size);
  offset += size;
  return true;
}
}  // namespace

bool MemoryBlobStore::put(const std::string &key, const Bytes &value) {
  values_[key] = value;
  return true;
}
bool MemoryBlobStore::get(const std::string &key, Bytes &value) const {
  auto found = values_.find(key);
  if (found == values_.end()) return false;
  value = found->second;
  return true;
}
bool MemoryBlobStore::erase(const std::string &key) { return values_.erase(key) > 0; }

Bytes encode_profile(const CardProfile &profile) {
  Bytes out{'N', 'F', 'C', 'E', version, static_cast<uint8_t>(profile.type)};
  out.push_back(static_cast<uint8_t>(profile.id.size()));
  append(out, profile.id.data(), profile.id.size());
  append(out, profile.uid.data(), profile.uid.size());
  append_state(out, profile.state);
  append_state(out, profile.factory);
  uint32_t checksum = crypto::jamcrc(out);
  append(out, &checksum, sizeof(checksum));
  return out;
}

bool decode_profile(const Bytes &bytes, CardProfile &profile) {
  if (bytes.size() < 12 || Bytes(bytes.begin(), bytes.begin() + 4) != Bytes{'N','F','C','E'} ||
      bytes[4] != version) return false;
  uint32_t stored = 0;
  std::memcpy(&stored, bytes.data() + bytes.size() - 4, 4);
  Bytes payload(bytes.begin(), bytes.end() - 4);
  if (crypto::jamcrc(payload) != stored) return false;
  size_t offset = 5;
  if (bytes[offset] > static_cast<uint8_t>(CardType::DesfireEv3)) return false;
  profile.type = static_cast<CardType>(bytes[offset++]);
  uint8_t id_size = bytes[offset++];
  if (id_size == 0 || id_size > 31 || offset + id_size + 4 > payload.size()) return false;
  profile.id.assign(reinterpret_cast<const char *>(bytes.data() + offset), id_size);
  offset += id_size;
  std::copy_n(bytes.begin() + offset, 4, profile.uid.begin());
  offset += 4;
  return read_state(payload, offset, profile.state) &&
         read_state(payload, offset, profile.factory) && offset == payload.size() &&
         validate(profile).empty();
}

bool ProfileRepository::save(const CardProfile &profile) {
  return validate(profile).empty() && store_.put("profile_" + profile.id, encode_profile(profile));
}
bool ProfileRepository::load(const std::string &id, CardProfile &profile) const {
  Bytes bytes;
  return store_.get("profile_" + id, bytes) && decode_profile(bytes, profile) &&
         profile.id == id;
}
bool ProfileRepository::remove(const std::string &id) {
  return store_.erase("profile_" + id);
}

bool persist_profile_change(ProfileRepository &repository, CardProfile &current,
                            const CardProfile &candidate) {
  if (!repository.save(candidate)) return false;
  current = candidate;
  return true;
}

}  // namespace nfc_emulator
