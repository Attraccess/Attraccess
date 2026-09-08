#include "nfc_emulator/engine.hpp"

#include "nfc_emulator/crypto.hpp"

#include <algorithm>

namespace nfc_emulator {
namespace {
const Bytes zero_iv(16, 0);
constexpr uint8_t ok = 0x00;
constexpr size_t max_apdu_size = 250;
constexpr size_t max_response_data = 248;

ExchangeResult reply(Bytes bytes) { return {Outcome::Response, std::move(bytes), 0, "engine"}; }
Bytes status(uint8_t value) { return {0x91, value}; }
Bytes rotate_left(const Bytes &value) {
  Bytes out = value;
  std::rotate(out.begin(), out.begin() + 1, out.end());
  return out;
}
bool equal(const Bytes &left, const uint8_t *right, size_t size) {
  return left.size() == size && std::equal(left.begin(), left.end(), right);
}
}  // namespace

ProtocolEngine::ProtocolEngine(RandomSource random) : random_(std::move(random)) {
  if (!random_) {
    random_ = [](uint8_t *data, size_t size) {
      static uint8_t next = 0x31;
      while (size--) *data++ = next++;
    };
  }
}

void ProtocolEngine::reset_session() {
  selected_ = Selected::None;
  version_frame_ = 0;
  pending_key_ = 0xff;
  authenticated_ = false;
  counter_ = 0;
  rnd_b_.clear();
  ti_.clear();
}

void ProtocolEngine::clear_authentication() {
  pending_key_ = 0xff;
  authenticated_ = false;
  counter_ = 0;
  rnd_b_.clear();
  ti_.clear();
  session_enc_ = {};
  session_mac_ = {};
}

ExchangeResult ProtocolEngine::authentication_failure(uint8_t value) {
  clear_authentication();
  return reply(status(value));
}

ExchangeResult ProtocolEngine::exchange(CardProfile &profile, const Bytes &apdu) {
  profile_ = &profile;
  if (pending_key_ != 0xff &&
      (apdu.size() < 2 || apdu[0] != 0x90 || apdu[1] != 0xaf))
    clear_authentication();
  if (apdu.size() < 4) return reply({0x67, 0x00});
  if (apdu.size() > max_apdu_size) return reply({0x67, 0x00});
  if (apdu[0] == 0x00) return iso(apdu);
  if (apdu[0] != 0x90) return reply({0x6e, 0x00});
  uint8_t lc = apdu.size() > 4 ? apdu[4] : 0;
  if (apdu.size() < 5U + lc) return reply({0x67, 0x00});
  Bytes data(apdu.begin() + 5, apdu.begin() + 5 + lc);
  return native(apdu, apdu[1], data);
}

ExchangeResult ProtocolEngine::native(const Bytes &, uint8_t ins, const Bytes &data) {
  switch (ins) {
    case 0x60:
      version_frame_ = 0;
      return version();
    case 0xaf:
      if (pending_key_ != 0xff) return authenticate_continue(data);
      if (version_frame_ > 0) return version();
      return reply(status(0x1c));
    case 0x5a:
      if (data.size() != 3) return reply(status(0x7e));
      clear_authentication();
      if (data == Bytes{0, 0, 0}) selected_ = Selected::Picc;
      else if (data == Bytes{0x55, 0xce, 0xac} && profile_->state.attraccess_app)
        selected_ = Selected::Attraccess;
      else return reply(status(0xa0));
      return reply(status(ok));
    case 0xca:
      if (data.size() != 5 || data[0] != 0x55 || data[1] != 0xce || data[2] != 0xac)
        return reply(status(0x9e));
      if (profile_->type == CardType::Ntag424) return reply(status(0x1c));
      profile_->state.attraccess_app = true;
      return reply(status(ok));
    case 0x64:
      if (data.size() != 1 || selected_ != Selected::Attraccess || data[0] > 5)
        return reply(status(0x40));
      return reply({profile_->state.keys[data[0]].version, 0x91, ok});
    case 0x71:
      clear_authentication();
      version_frame_ = 0;
      return authenticate_first(data);
    case 0xc4:
      return change_key(data);
    default: {
      ExchangeResult result = reply(status(0x1c));
      result.source = "default";
      return result;
    }
  }
}

ExchangeResult ProtocolEngine::version() {
  uint8_t hw_type = profile_->type == CardType::Ntag424 ? 0x04 : 0x01;
  uint8_t major = profile_->type == CardType::DesfireEv3 ? 0x33 :
                  profile_->type == CardType::DesfireEv2 ? 0x12 : 0x00;
  if (version_frame_ == 0) {
    ++version_frame_;
    return reply({0x04, hw_type, 0x01, major, 0x00, 0x0f, 0x05, 0x91, 0xaf});
  }
  if (version_frame_ == 1) {
    ++version_frame_;
    return reply({0x04, hw_type, 0x01, major, 0x00, 0x0f, 0x05, 0x91, 0xaf});
  }
  version_frame_ = 0;
  Bytes result(profile_->uid.begin(), profile_->uid.end());
  result.insert(result.end(), {0, 0, 0, 0, 0, 0, 0, 0, 0x24, 0x91, ok});
  return reply(std::move(result));
}

ExchangeResult ProtocolEngine::iso(const Bytes &apdu) {
  if (apdu[1] == 0xa4) {
    uint8_t lc = apdu.size() > 4 ? apdu[4] : 0;
    if (apdu.size() < 5U + lc) return reply({0x67, 0x00});
    Bytes value(apdu.begin() + 5, apdu.begin() + 5 + lc);
    static const uint8_t ndef_aid[] = {0xd2,0x76,0x00,0x00,0x85,0x01,0x01};
    if ((value.size() == 7 && equal(value, ndef_aid, sizeof(ndef_aid))) ||
        value == Bytes{0xe1, 0x03} || value == Bytes{0xe1, 0x04}) {
      selected_ = value.size() == 7 ? Selected::NdefApplication :
                  value == Bytes{0xe1, 0x03} ? Selected::CapabilityContainer :
                                               Selected::NdefData;
      clear_authentication();
      return reply({0x90, ok});
    }
    return reply({0x6a, 0x82});
  }
  if (apdu[1] == 0xb0 && (selected_ == Selected::CapabilityContainer ||
                          selected_ == Selected::NdefData)) {
    static const Bytes capability_container{
        0x00,0x0f,0x20,0x00,0x3b,0x00,0x34,0x04,0x06,0xe1,0x04,0x04,0x00,0x00,0x00};
    const Bytes &file = selected_ == Selected::CapabilityContainer
                            ? capability_container : profile_->state.ndef;
    size_t offset = static_cast<size_t>(apdu[2]) << 8 | apdu[3];
    size_t length = apdu.size() > 4 && apdu[4] ? apdu[4] : 256;
    if (offset > file.size()) return reply({0x6b, 0x00});
    length = std::min({length, file.size() - offset, max_response_data});
    Bytes result(file.begin() + offset, file.begin() + offset + length);
    result.insert(result.end(), {0x90, ok});
    return reply(std::move(result));
  }
  if (apdu[1] == 0xd6 && selected_ == Selected::NdefData) {
    uint8_t lc = apdu.size() > 4 ? apdu[4] : 0;
    size_t offset = static_cast<size_t>(apdu[2]) << 8 | apdu[3];
    if (apdu.size() < 5U + lc || offset + lc > 1024) return reply({0x67, 0x00});
    if (profile_->state.ndef.size() < offset + lc) profile_->state.ndef.resize(offset + lc);
    std::copy_n(apdu.begin() + 5, lc, profile_->state.ndef.begin() + offset);
    return reply({0x90, ok});
  }
  return reply({0x6d, 0x00});
}

ExchangeResult ProtocolEngine::authenticate_first(const Bytes &data) {
  if (data.size() != 5 || data[0] > 5 ||
      (profile_->type != CardType::Ntag424 && selected_ != Selected::Attraccess))
    return authentication_failure();
  pending_key_ = data[0];
  rnd_b_.resize(16);
  random_(rnd_b_.data(), rnd_b_.size());
  Bytes result;
  if (!crypto::aes_cbc_encrypt(profile_->state.keys[pending_key_].value,
                               zero_iv, rnd_b_, result)) {
    clear_authentication();
    return {Outcome::Error, {}, 0, "engine"};
  }
  result.insert(result.end(), {0x91, 0xaf});
  return reply(std::move(result));
}

ExchangeResult ProtocolEngine::authenticate_continue(const Bytes &data) {
  if (data.size() != 32 || pending_key_ > 5) return authentication_failure();
  const Key key = profile_->state.keys[pending_key_].value;
  Bytes plain;
  if (!crypto::aes_cbc_decrypt(key, zero_iv, data, plain))
    return authentication_failure();
  Bytes rnd_a(plain.begin(), plain.begin() + 16);
  Bytes rotated_b(plain.begin() + 16, plain.end());
  if (rotated_b != rotate_left(rnd_b_)) {
    return authentication_failure();
  }
  ti_.resize(4);
  random_(ti_.data(), ti_.size());
  Bytes response = ti_;
  Bytes rotated_a = rotate_left(rnd_a);
  response.insert(response.end(), rotated_a.begin(), rotated_a.end());
  response.insert(response.end(), 12, 0);
  Bytes encrypted_response;
  if (!crypto::aes_cbc_encrypt(key, zero_iv, response, encrypted_response))
    return authentication_failure();
  response = std::move(encrypted_response);
  response.insert(response.end(), {0x91, ok});
  if (!crypto::derive_session_keys(key, rnd_a, rnd_b_, session_enc_, session_mac_))
    return authentication_failure();
  pending_key_ = 0xff;
  authenticated_ = true;
  counter_ = 0;
  return reply(std::move(response));
}

Bytes ProtocolEngine::response_mac(uint8_t response_status, const Bytes &data) const {
  Bytes message{response_status, static_cast<uint8_t>(counter_ & 0xff),
                static_cast<uint8_t>(counter_ >> 8)};
  message.insert(message.end(), ti_.begin(), ti_.end());
  message.insert(message.end(), data.begin(), data.end());
  auto mac = crypto::short_cmac(session_mac_, message);
  return Bytes(mac.begin(), mac.end());
}

ExchangeResult ProtocolEngine::change_key(const Bytes &data) {
  if (!authenticated_ || data.size() < 1 + 16 + 8 || data[0] > 5 ||
      (data.size() - 1 - 8) % 16 != 0) return authentication_failure();
  uint8_t key_number = data[0];
  Bytes encrypted(data.begin() + 1, data.end() - 8);
  Bytes supplied_mac(data.end() - 8, data.end());
  Bytes command_mac{0xc4, static_cast<uint8_t>(counter_ & 0xff),
                    static_cast<uint8_t>(counter_ >> 8)};
  command_mac.insert(command_mac.end(), ti_.begin(), ti_.end());
  command_mac.push_back(key_number);
  command_mac.insert(command_mac.end(), encrypted.begin(), encrypted.end());
  auto expected = crypto::short_cmac(session_mac_, command_mac);
  if (!std::equal(expected.begin(), expected.end(), supplied_mac.begin()))
    return authentication_failure(0x1e);
  Bytes iv_input{0xa5, 0x5a};
  iv_input.insert(iv_input.end(), ti_.begin(), ti_.end());
  iv_input.push_back(static_cast<uint8_t>(counter_ & 0xff));
  iv_input.insert(iv_input.end(), 9, 0);
  Bytes iv;
  Bytes plain;
  if (!crypto::aes_cbc_encrypt(session_enc_, zero_iv, iv_input, iv) ||
      !crypto::aes_cbc_decrypt(session_enc_, iv, encrypted, plain))
    return authentication_failure(0x1e);
  size_t required = key_number == 0 ? 17 : 21;
  if (plain.size() <= required || plain[required] != 0x80 ||
      !std::all_of(plain.begin() + required + 1, plain.end(),
                   [](uint8_t byte) { return byte == 0; }))
    return authentication_failure(0x7e);
  plain.resize(required);
  Key new_key{};
  if (key_number == 0) std::copy_n(plain.begin(), 16, new_key.begin());
  else for (size_t i = 0; i < 16; ++i)
    new_key[i] = plain[i] ^ profile_->state.keys[key_number].value[i];
  if (key_number > 0) {
    uint32_t crc = crypto::jamcrc(Bytes(new_key.begin(), new_key.end()));
    uint32_t supplied = static_cast<uint32_t>(plain[17]) |
                        static_cast<uint32_t>(plain[18]) << 8 |
                        static_cast<uint32_t>(plain[19]) << 16 |
                        static_cast<uint32_t>(plain[20]) << 24;
    if (crc != supplied) return authentication_failure(0x1e);
  }
  profile_->state.keys[key_number].value = new_key;
  profile_->state.keys[key_number].version = plain[16];
  ++counter_;
  Bytes result = response_mac(ok);
  result.insert(result.end(), {0x91, ok});
  return reply(std::move(result));
}

}  // namespace nfc_emulator
