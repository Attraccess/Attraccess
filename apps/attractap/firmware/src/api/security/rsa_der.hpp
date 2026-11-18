#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

// Minimal DER helpers for the RSA-3072 reader identity (ATT-1207). Pure code: no mbedTLS, no ESP-IDF,
// so the same functions run in the host tests.
namespace RsaDer
{
    constexpr size_t MODULUS_BYTES = 384;     // exactly 3072 bits, top bit set
    constexpr size_t SPKI_BYTES = 422;        // canonical SubjectPublicKeyInfo of an RSA-3072 key, e = 65537

    // Canonical SPKI for modulus `n` (384 bytes, big endian, top bit set) and e = 65537. Empty on bad input.
    std::vector<uint8_t> spkiFromModulus(const uint8_t *modulus, size_t length);
    // True only for the canonical RSA-3072 / e = 65537 SPKI form (the server accepts exactly this).
    bool isCanonicalRsa3072Spki(const std::vector<uint8_t> &spki);
    // The 384-byte modulus of a canonical RSA-3072 SPKI; empty otherwise.
    std::vector<uint8_t> modulusFromSpki(const std::vector<uint8_t> &spki);

    struct PrivateKeyParts
    {
        std::vector<uint8_t> modulus;         // 384 bytes, big endian
        std::vector<uint8_t> publicExponent;  // minimal big endian
        std::vector<uint8_t> privateExponent; // 384 bytes, big endian, zero padded
    };
    // Reads n, e and d from a PKCS#1 RSAPrivateKey (what psa_export_key returns). False unless a
    // 3072-bit key with e = 65537 and a well-formed structure.
    bool parsePrivateKey(const uint8_t *der, size_t length, PrivateKeyParts &out);
}
