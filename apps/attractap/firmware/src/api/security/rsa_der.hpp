#pragma once

#include <array>
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

    // Zeroes `length` bytes through a volatile pointer, so the compiler cannot drop it (no mbedTLS here).
    void wipe(void *data, size_t length);

    // Fixed-size, so parsing never reallocates (and leaves) a copy of d on the heap. Wiped on destruction;
    // the owner decides where it lives (the reader keeps it in internal RAM, see ds_creator.cpp).
    struct PrivateKeyParts
    {
        std::array<uint8_t, MODULUS_BYTES> modulus{};         // big endian
        std::array<uint8_t, MODULUS_BYTES> privateExponent{}; // big endian, zero padded on the left

        PrivateKeyParts() = default;
        PrivateKeyParts(const PrivateKeyParts &) = default;
        PrivateKeyParts &operator=(const PrivateKeyParts &) = default;
        ~PrivateKeyParts() { clear(); }
        void clear()
        {
            wipe(modulus.data(), modulus.size());
            wipe(privateExponent.data(), privateExponent.size());
        }
    };
    // Reads n and d from a PKCS#1 RSAPrivateKey (what psa_export_key returns) into `out`, checking
    // e = 65537. False unless a 3072-bit key with a well-formed structure; `out` is wiped then. No heap.
    bool parsePrivateKey(const uint8_t *der, size_t length, PrivateKeyParts &out);
}
