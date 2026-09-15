#pragma once

#include "nfc_emulator/model.hpp"

namespace nfc_emulator::crypto {

bool aes_cbc_encrypt(const Key &key, const Bytes &iv, const Bytes &plain,
                     Bytes &output);
bool aes_cbc_decrypt(const Key &key, const Bytes &iv, const Bytes &cipher,
                     Bytes &output);
Key cmac(const Key &key, const Bytes &message);
std::array<uint8_t, 8> short_cmac(const Key &key, const Bytes &message);
bool derive_session_keys(const Key &key, const Bytes &rnd_a, const Bytes &rnd_b,
                         Key &session_enc, Key &session_mac);
uint32_t jamcrc(const Bytes &bytes);

}  // namespace nfc_emulator::crypto
