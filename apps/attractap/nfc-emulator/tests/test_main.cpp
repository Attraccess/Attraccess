#include "nfc_emulator/behavior.hpp"
#include "nfc_emulator/api_validation.hpp"
#include "nfc_emulator/crypto.hpp"
#include "nfc_emulator/persistence.hpp"
#include "nfc_emulator/trace.hpp"

#include <cstdlib>
#include <iostream>

using namespace nfc_emulator;

namespace {
int failures = 0;
#define CHECK(value) do { if (!(value)) { std::cerr << __FILE__ << ':' << __LINE__ << " check failed: " #value "\n"; ++failures; } } while (0)

Bytes bytes(const char *value) {
  Bytes out;
  CHECK(unhex(value, out));
  return out;
}
Key key(const char *value) {
  Bytes data = bytes(value);
  Key out{};
  CHECK(data.size() == out.size());
  std::copy_n(data.begin(), std::min(data.size(), out.size()), out.begin());
  return out;
}
Bytes encrypt(const Key &key_value, const Bytes &iv, const Bytes &plain) {
  Bytes output;
  CHECK(crypto::aes_cbc_encrypt(key_value, iv, plain, output));
  return output;
}
Bytes decrypt(const Key &key_value, const Bytes &iv, const Bytes &cipher) {
  Bytes output;
  CHECK(crypto::aes_cbc_decrypt(key_value, iv, cipher, output));
  return output;
}
std::pair<Key, Key> sessions(const Key &key_value, const Bytes &rnd_a,
                             const Bytes &rnd_b) {
  std::pair<Key, Key> output;
  CHECK(crypto::derive_session_keys(key_value, rnd_a, rnd_b,
                                    output.first, output.second));
  return output;
}

void crypto_vectors() {
  Key k = key("2b7e151628aed2a6abf7158809cf4f3c");
  Bytes iv = bytes("000102030405060708090a0b0c0d0e0f");
  Bytes plain = bytes("6bc1bee22e409f96e93d7e117393172a");
  Bytes cipher = encrypt(k, iv, plain);
  CHECK(hex(cipher) == "7649abac8119b246cee98e9b12e9197d");
  CHECK(decrypt(k, iv, cipher) == plain);
  Key mac = crypto::cmac(k, {});
  CHECK(hex(Bytes(mac.begin(), mac.end())) ==
        "bb1d6929e95937287fa37d129b756746");
  CHECK(crypto::jamcrc(bytes("313233343536373839")) == 0x340bc6d9U);
  auto session = sessions(
      Key{}, bytes("b04d0787c93ee0cc8cacc8e86f16c6fe"),
      bytes("fa659ad0dca738dd65dc7dc38612ad81"));
  CHECK(hex(Bytes(session.first.begin(), session.first.end())) ==
        "63dc07286289a7a6c0334ca31c314a04");
  Bytes invalid;
  CHECK(!crypto::aes_cbc_encrypt(k, Bytes(15), plain, invalid));
  CHECK(invalid.empty());
  Key invalid_enc{}, invalid_mac{};
  CHECK(!crypto::derive_session_keys(k, Bytes(15), Bytes(16), invalid_enc, invalid_mac));
}

void model_and_persistence() {
  CardProfile profile = factory_profile("card-1", CardType::DesfireEv3,
                                        {0x08, 0xaa, 0xbb, 0xcc});
  CHECK(validate(profile).empty());
  profile.uid[0] = 0x04;
  CHECK(!validate(profile).empty());
  profile.uid[0] = 0x08;
  profile.state.attraccess_app = true;
  profile.state.keys[2].version = 1;
  MemoryBlobStore blobs;
  ProfileRepository repository(blobs);
  CHECK(repository.save(profile));
  CardProfile loaded;
  CHECK(repository.load("card-1", loaded));
  CHECK(loaded.state.keys[2].version == 1);
  loaded.state.keys[2].version = 9;
  factory_reset(loaded);
  CHECK(loaded.state.keys[2].version == 0);
  Bytes corrupt = encode_profile(profile);
  corrupt[10] ^= 1;
  CHECK(!decode_profile(corrupt, loaded));

  ProvisioningConfig provisioning{"Lab", "secretpass", "0123456789abcdef"};
  Bytes encoded_provisioning = encode_provisioning(provisioning);
  ProvisioningConfig decoded_provisioning;
  CHECK(decode_provisioning(encoded_provisioning, decoded_provisioning));
  CHECK(decoded_provisioning.ssid == "Lab" && decoded_provisioning.token == provisioning.token);
  encoded_provisioning[8] ^= 1;
  CHECK(!decode_provisioning(encoded_provisioning, decoded_provisioning));
}

class FailingBlobStore final : public BlobStore {
 public:
  bool put(const std::string &, const Bytes &) override { return false; }
  bool get(const std::string &, Bytes &) const override { return false; }
  bool erase(const std::string &) override { return false; }
};

void persistence_rollback() {
  FailingBlobStore blobs;
  ProfileRepository repository(blobs);
  CardProfile current = factory_profile("card", CardType::Ntag424, {0x08,1,2,3});
  CardProfile candidate = current;
  candidate.state.keys[1].version = 7;
  CHECK(!persist_profile_change(repository, current, candidate));
  CHECK(current.state.keys[1].version == 0);
}

void api_validation() {
  CHECK(validate_provisioning("Lab", "", "0123456789abcdef").valid);
  CHECK(!validate_provisioning("", "", "0123456789abcdef").valid);
  CHECK(!validate_provisioning("Lab", "", "short").valid);
  CHECK(!validate_provisioning("Lab", "short", "0123456789abcdef").valid);
  CHECK(validate_removal(-1, 2, -1).valid);
  CHECK(!validate_removal(0, -1, -1).valid);
  CHECK(!validate_removal(-1, -1, -1).valid);
  CHECK(!validate_removal(-1, 0, -1).valid);
  CHECK(!validate_removal(-1, -1, 256).valid);
}

void get_version_and_selection() {
  CardProfile profile = factory_profile("ev2", CardType::DesfireEv2,
                                        {0x08, 1, 2, 3});
  ProtocolEngine engine;
  auto first = engine.exchange(profile, bytes("9060000000"));
  CHECK(first.response[1] == 0x01 && first.response[first.response.size() - 1] == 0xaf);
  CHECK(engine.exchange(profile, bytes("90af000000")).response.back() == 0xaf);
  CHECK(engine.exchange(profile, bytes("90af000000")).response.back() == 0x00);
  CHECK(engine.exchange(profile, bytes("905a00000355ceac00")).response == bytes("91a0"));
  CHECK(engine.exchange(profile, bytes("90ca00000555ceac0f8600")).response == bytes("9100"));
  CHECK(engine.exchange(profile, bytes("905a00000355ceac00")).response == bytes("9100"));
  CHECK(engine.exchange(profile, bytes("90640000010200")).response == bytes("009100"));
}

void ndef_files_and_limits() {
  CardProfile profile = factory_profile("tag", CardType::Ntag424, {0x08,1,2,3});
  profile.state.ndef = {0x00, 0x02, 0xaa, 0xbb};
  ProtocolEngine engine;
  CHECK(engine.exchange(profile, bytes("00a4040007d276000085010100")).response == bytes("9000"));
  CHECK(engine.exchange(profile, bytes("00a4000002e10300")).response == bytes("9000"));
  auto cc = engine.exchange(profile, bytes("00b0000000"));
  CHECK(cc.response.size() == 17 && cc.response[0] == 0x00 && cc.response[1] == 0x0f);
  CHECK(engine.exchange(profile, bytes("00d600000100")).response == bytes("6d00"));
  CHECK(engine.exchange(profile, bytes("00a4000002e10400")).response == bytes("9000"));
  CHECK(engine.exchange(profile, bytes("00b0000000")).response == bytes("0002aabb9000"));
  Bytes oversized(251, 0); oversized[0] = 0x90; oversized[1] = 0x60;
  CHECK(engine.exchange(profile, oversized).response == bytes("6700"));
}

void authentication_state() {
  CardProfile profile = factory_profile("tag", CardType::Ntag424,
                                        {0x08, 4, 5, 6});
  uint8_t random = 0;
  ProtocolEngine engine([&](uint8_t *out, size_t size) {
    while (size--) *out++ = random++;
  });
  auto challenge = engine.exchange(profile, bytes("9071000005000300000000"));
  CHECK(challenge.response.size() == 18);
  Bytes encrypted_b(challenge.response.begin(), challenge.response.begin() + 16);
  Bytes rnd_b = decrypt(Key{}, Bytes(16), encrypted_b);
  Bytes original_rnd_b = rnd_b;
  Bytes rnd_a(16);
  for (size_t i = 0; i < rnd_a.size(); ++i) rnd_a[i] = static_cast<uint8_t>(0xa0 + i);
  Bytes answer = rnd_a;
  std::rotate(rnd_b.begin(), rnd_b.begin() + 1, rnd_b.end());
  answer.insert(answer.end(), rnd_b.begin(), rnd_b.end());
  Bytes encrypted = encrypt(Key{}, Bytes(16), answer);
  Bytes command{0x90, 0xaf, 0, 0, 32};
  command.insert(command.end(), encrypted.begin(), encrypted.end());
  command.push_back(0);
  auto authenticated = engine.exchange(profile, command);
  CHECK(authenticated.response.size() == 34);
  Bytes auth_plain = decrypt(
      Key{}, Bytes(16), Bytes(authenticated.response.begin(), authenticated.response.begin() + 32));
  CHECK(Bytes(auth_plain.begin() + 4, auth_plain.begin() + 20) == [&] { Bytes r = rnd_a; std::rotate(r.begin(), r.begin() + 1, r.end()); return r; }());

  Bytes ti(auth_plain.begin(), auth_plain.begin() + 4);
  auto session = sessions(Key{}, rnd_a, original_rnd_b);
  Key new_key = key("00802233445566778899aabbccddeeff");
  Bytes key_data(new_key.begin(), new_key.end());
  key_data.push_back(1);
  uint32_t crc = crypto::jamcrc(Bytes(new_key.begin(), new_key.end()));
  for (int i = 0; i < 4; ++i) key_data.push_back(static_cast<uint8_t>(crc >> (i * 8)));
  key_data.push_back(0x80);
  key_data.resize(32, 0);
  Bytes iv_input{0xa5, 0x5a};
  iv_input.insert(iv_input.end(), ti.begin(), ti.end());
  iv_input.insert(iv_input.end(), 10, 0);
  Bytes iv = encrypt(session.first, Bytes(16), iv_input);
  Bytes encrypted_key = encrypt(session.first, iv, key_data);
  Bytes mac_input{0xc4, 0, 0};
  mac_input.insert(mac_input.end(), ti.begin(), ti.end());
  mac_input.push_back(1);
  mac_input.insert(mac_input.end(), encrypted_key.begin(), encrypted_key.end());
  auto mac = crypto::short_cmac(session.second, mac_input);
  Bytes change{0x90, 0xc4, 0, 0, 41, 1};
  change.insert(change.end(), encrypted_key.begin(), encrypted_key.end());
  change.insert(change.end(), mac.begin(), mac.end());
  change.push_back(0);
  auto changed = engine.exchange(profile, change);
  CHECK(changed.response.size() == 10 && changed.response[8] == 0x91 && changed.response[9] == 0);
  CHECK(profile.state.keys[1].value == new_key && profile.state.keys[1].version == 1);

  engine.reset_session();
  CHECK(engine.exchange(profile, bytes("9071000005000300000000")).response.size() == 18);
  engine.exchange(profile, bytes("9000000000"));
  Bytes stale_continue{0x90, 0xaf, 0, 0, 32};
  stale_continue.insert(stale_continue.end(), 32, 0);
  stale_continue.push_back(0);
  CHECK(engine.exchange(profile, stale_continue).response == bytes("911c"));
}

void precedence_and_trace() {
  CardProfile profile = factory_profile("tag", CardType::Ntag424, {0x08, 1, 1, 1});
  ProtocolEngine engine;
  BehaviorController behavior;
  Fault fault;
  fault.instruction = 0x60;
  fault.response = {0xfa};
  behavior.set_fault(fault);
  Override override;
  override.command = bytes("9060000000");
  override.result.response = {0xfb};
  override.remaining = 1;
  behavior.set_overrides({override});
  auto result = behavior.exchange(profile, override.command, engine);
  CHECK(result.source == "override" && result.response == Bytes{0xfb});
  result = behavior.exchange(profile, override.command, engine);
  CHECK(result.source == "fault" && result.response == Bytes{0xfa});
  result = behavior.exchange(profile, override.command, engine);
  CHECK(result.source == "engine");

  behavior.clear();
  behavior.set_removal({0, 1, {}});
  behavior.set_overrides({override});
  behavior.begin_presentation();
  behavior.exchange(profile, override.command, engine);
  CHECK(behavior.should_remove());
  behavior.begin_presentation();
  CHECK(!behavior.should_remove());

  behavior.set_removal({100, 0, {}});
  behavior.begin_presentation();
  CHECK(!behavior.should_remove(99));
  CHECK(behavior.should_remove(100));

  Fault removal_fault;
  removal_fault.instruction = 0x60;
  removal_fault.outcome = Outcome::Timeout;
  behavior.set_fault(removal_fault);
  behavior.set_overrides({});
  behavior.set_removal({0, 1, {}});
  behavior.begin_presentation();
  CHECK(behavior.exchange(profile, override.command, engine).source == "fault");
  CHECK(behavior.should_remove());

  behavior.clear();
  behavior.set_scenario(Scenario::MalformedResponse);
  behavior.set_removal({0, 1, {}});
  behavior.begin_presentation();
  CHECK(behavior.exchange(profile, override.command, engine).source == "scenario");
  CHECK(behavior.should_remove());

  TraceLog trace(2);
  trace.append({1, 2, {1}, {2}, Outcome::Response, "engine"});
  trace.append({2, 2, {2}, {3}, Outcome::Response, "engine"});
  trace.append({3, 2, {3}, {4}, Outcome::Response, "engine"});
  CHECK(trace.entries().size() == 2 && trace.entries().front().timestamp_ms == 2);
}
}  // namespace

int main() {
  crypto_vectors();
  model_and_persistence();
  persistence_rollback();
  api_validation();
  get_version_and_selection();
  ndef_files_and_limits();
  authentication_state();
  precedence_and_trace();
  if (failures) std::cerr << failures << " test(s) failed\n";
  else std::cout << "all host tests passed\n";
  return failures == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}
