#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

// Plaintext operands of the ESP32-S3 Digital Signature peripheral for an RSA-3072 key
// (esp_ds_p_data_t, before esp_ds_encrypt_params). All arrays are little-endian 32-bit words, zero
// padded to the 4096-bit maximum the peripheral supports. Pure code, shared with the host tests.
namespace DsParams
{
    constexpr size_t RSA_BITS = 3072;
    constexpr size_t MAX_WORDS = 4096 / 32;
    constexpr size_t KEY_WORDS = RSA_BITS / 32;
    // "Length" operand: number of words minus one (esp_digital_signature_length_t ESP_DS_RSA_3072).
    constexpr uint32_t LENGTH_FIELD = KEY_WORDS - 1;

    struct Operands
    {
        uint32_t Y[MAX_WORDS];  // private exponent d
        uint32_t M[MAX_WORDS];  // modulus
        uint32_t Rb[MAX_WORDS]; // 2^(2 * 3072) mod M
        uint32_t M_prime;       // -M^-1 mod 2^32
        uint32_t length;        // LENGTH_FIELD
    };

    // `modulus` and `privateExponent` are 384 big-endian bytes. False on bad input (even or too small modulus).
    bool compute(const uint8_t *modulus, const uint8_t *privateExponent, Operands &out);
}
