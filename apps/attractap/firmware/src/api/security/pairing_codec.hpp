#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

// Key-bound pairing values, derived exactly like apps/api/src/attractap/security/pairing-protocol.ts.
// Both sides run tests/pairing/vectors.json, so they provably agree.
namespace PairingCodec
{
    using Bytes = std::vector<uint8_t>;

    constexpr const char *COMMIT_TAG = "attractap-pairing-commit-v1";
    constexpr const char *CODE_TAG = "attractap-pairing-code-v1";
    constexpr size_t NONCE_BYTES = 16;
    constexpr size_t CODE_LENGTH = 6;
    constexpr size_t PATTERN_LENGTH = 8;
    constexpr uint8_t COLOUR_COUNT = 6;
    // Order of the colour indices: red, green, blue, yellow, white, magenta.
    extern const char *const COLOUR_NAMES[COLOUR_COUNT];

    struct Derived
    {
        std::string code; // 6 characters without the display hyphen
        uint8_t pattern[PATTERN_LENGTH];
    };

    // Cs = SHA-256(len-prefixed: tag, Ps, Pr, Ns)
    bool commitment(const Bytes &serverPublicKey, const Bytes &readerPublicKey, const Bytes &serverNonce, Bytes &out);
    // Constant-time comparison against a freshly computed commitment.
    bool commitmentMatches(const Bytes &expected, const Bytes &serverPublicKey, const Bytes &readerPublicKey,
                           const Bytes &serverNonce);
    bool derive(const Bytes &readerPublicKey, const Bytes &serverPublicKey, const Bytes &readerNonce,
                const Bytes &serverNonce, Derived &out);
    // The first 8 digest bytes as a big-endian integer mod 31^6, written in base 31.
    std::string codeFromDigest(const uint8_t *digest);
    // "K7P3XQ" -> "K7P-3XQ"
    std::string displayCode(const std::string &code);

    bool base64Decode(const std::string &text, Bytes &out);
    std::string base64Encode(const uint8_t *data, size_t length);
    inline std::string base64Encode(const Bytes &data) { return base64Encode(data.data(), data.size()); }
}
