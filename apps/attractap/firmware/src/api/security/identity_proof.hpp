#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

// Identity upgrade proof (ATT-1207, server: apps/api/src/attractap/security/identity-upgrade*).
// The reader signs a domain-separated tuple with its new (DS) key; each field is a u32 big-endian
// length followed by its bytes, in this order:
//   "attractap-identity-upgrade-v1", installationId (UTF-8), readerId (decimal ASCII),
//   old credential fingerprint (raw SHA-256 of the old SPKI DER), new SPKI DER, nonce (32 bytes).
// Pure code: tests/identity-upgrade checks it byte for byte against the vector the API spec uses.
namespace IdentityProof
{
    constexpr const char *DOMAIN = "attractap-identity-upgrade-v1";
    constexpr size_t NONCE_BYTES = 32;
    constexpr size_t FINGERPRINT_BYTES = 32;
    // RSA-PSS, SHA-256, MGF1-SHA256, salt length 32.
    constexpr size_t PSS_SALT_BYTES = 32;

    std::vector<uint8_t> tuple(const std::string &installationId, uint32_t readerId,
                               const std::vector<uint8_t> &oldFingerprint, const std::vector<uint8_t> &newSpki,
                               const std::vector<uint8_t> &nonce);
}
