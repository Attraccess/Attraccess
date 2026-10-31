#include "pairing_codec.hpp"

#include <cstring>

#include "mbedtls/base64.h"
#include "psa/crypto.h"

namespace PairingCodec
{
    const char *const COLOUR_NAMES[COLOUR_COUNT] = {"red", "green", "blue", "yellow", "white", "magenta"};

    namespace
    {
        constexpr const char *ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
        constexpr uint64_t ALPHABET_SIZE = 31;
        constexpr size_t DIGEST_BYTES = 32;
        constexpr size_t PATTERN_OFFSET = 8;

        bool updateField(psa_hash_operation_t &operation, const uint8_t *data, size_t length)
        {
            const uint8_t prefix[4] = {static_cast<uint8_t>(length >> 24), static_cast<uint8_t>(length >> 16),
                                       static_cast<uint8_t>(length >> 8), static_cast<uint8_t>(length)};
            return psa_hash_update(&operation, prefix, sizeof(prefix)) == PSA_SUCCESS &&
                   (length == 0 || psa_hash_update(&operation, data, length) == PSA_SUCCESS);
        }

        // Length-prefixed concatenation so field boundaries cannot be shifted.
        bool hashFields(const char *tag, std::initializer_list<const Bytes *> fields, uint8_t *digest)
        {
            if (psa_crypto_init() != PSA_SUCCESS)
            {
                return false;
            }
            psa_hash_operation_t operation = PSA_HASH_OPERATION_INIT;
            bool ok = psa_hash_setup(&operation, PSA_ALG_SHA_256) == PSA_SUCCESS &&
                      updateField(operation, reinterpret_cast<const uint8_t *>(tag), strlen(tag));
            for (const Bytes *field : fields)
            {
                ok = ok && updateField(operation, field->data(), field->size());
            }
            size_t length = 0;
            ok = ok && psa_hash_finish(&operation, digest, DIGEST_BYTES, &length) == PSA_SUCCESS &&
                 length == DIGEST_BYTES;
            if (!ok)
            {
                psa_hash_abort(&operation);
            }
            return ok;
        }
    }

    bool commitment(const Bytes &serverPublicKey, const Bytes &readerPublicKey, const Bytes &serverNonce, Bytes &out)
    {
        out.assign(DIGEST_BYTES, 0);
        return hashFields(COMMIT_TAG, {&serverPublicKey, &readerPublicKey, &serverNonce}, out.data());
    }

    bool commitmentMatches(const Bytes &expected, const Bytes &serverPublicKey, const Bytes &readerPublicKey,
                           const Bytes &serverNonce)
    {
        Bytes actual;
        if (!commitment(serverPublicKey, readerPublicKey, serverNonce, actual) || expected.size() != actual.size())
        {
            return false;
        }
        // Constant time (mbedtls/constant_time.h has no C++ linkage guard).
        uint8_t difference = 0;
        for (size_t i = 0; i < actual.size(); i++)
        {
            difference |= static_cast<uint8_t>(expected[i] ^ actual[i]);
        }
        return difference == 0;
    }

    std::string codeFromDigest(const uint8_t *digest)
    {
        uint64_t value = 0;
        for (size_t i = 0; i < 8; i++)
        {
            value = (value << 8) | digest[i];
        }
        uint64_t modulus = 1;
        for (size_t i = 0; i < CODE_LENGTH; i++)
        {
            modulus *= ALPHABET_SIZE;
        }
        value %= modulus;
        std::string code(CODE_LENGTH, ' ');
        for (size_t i = CODE_LENGTH; i > 0; i--)
        {
            code[i - 1] = ALPHABET[value % ALPHABET_SIZE];
            value /= ALPHABET_SIZE;
        }
        return code;
    }

    bool derive(const Bytes &readerPublicKey, const Bytes &serverPublicKey, const Bytes &readerNonce,
                const Bytes &serverNonce, Derived &out)
    {
        uint8_t digest[DIGEST_BYTES];
        if (!hashFields(CODE_TAG, {&readerPublicKey, &serverPublicKey, &readerNonce, &serverNonce}, digest))
        {
            return false;
        }
        out.code = codeFromDigest(digest);
        for (size_t i = 0; i < PATTERN_LENGTH; i++)
        {
            const uint16_t word = static_cast<uint16_t>((digest[PATTERN_OFFSET + 2 * i] << 8) |
                                                        digest[PATTERN_OFFSET + 2 * i + 1]);
            out.pattern[i] = static_cast<uint8_t>(word % COLOUR_COUNT);
        }
        return true;
    }

    std::string displayCode(const std::string &code)
    {
        return code.size() == CODE_LENGTH ? code.substr(0, 3) + "-" + code.substr(3) : code;
    }

    bool base64Decode(const std::string &text, Bytes &out)
    {
        size_t length = 0;
        const auto *input = reinterpret_cast<const unsigned char *>(text.data());
        int result = mbedtls_base64_decode(nullptr, 0, &length, input, text.size());
        if (result != 0 && result != MBEDTLS_ERR_BASE64_BUFFER_TOO_SMALL)
        {
            return false;
        }
        out.assign(length, 0);
        if (length == 0)
        {
            return true;
        }
        return mbedtls_base64_decode(out.data(), out.size(), &length, input, text.size()) == 0 &&
               (out.resize(length), true);
    }

    std::string base64Encode(const uint8_t *data, size_t length)
    {
        size_t needed = 0;
        mbedtls_base64_encode(nullptr, 0, &needed, data, length);
        std::string out(needed, '\0');
        size_t written = 0;
        if (mbedtls_base64_encode(reinterpret_cast<unsigned char *>(out.data()), out.size(), &written, data, length) != 0)
        {
            return "";
        }
        out.resize(written);
        return out;
    }
}
