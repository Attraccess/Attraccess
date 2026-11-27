#include "signed_image.hpp"

#include <algorithm>
#include <cstring>
#include <memory>
#include <vector>

#include "psa/crypto.h"

namespace
{
    constexpr uint8_t SIG_MAGIC = 0xE7;
    constexpr uint8_t SIG_VERSION_RSA = 0x02;
    constexpr size_t KEY_BYTES = 384;
    constexpr size_t DIGEST_OFFSET = 4;
    constexpr size_t KEY_FIELDS_OFFSET = 36;
    // N(384) e(4) R(384) M'(4)
    constexpr size_t KEY_FIELDS_BYTES = KEY_BYTES + 4 + KEY_BYTES + 4;
    constexpr size_t SIGNATURE_OFFSET = KEY_FIELDS_OFFSET + KEY_FIELDS_BYTES;
    constexpr size_t CRC_COVERED_BYTES = 1196;
    constexpr uint32_t APP_DESC_MAGIC = 0xABCD5432;
    // esp_image_header_t (24) + first segment header (8).
    constexpr uint32_t APP_DESC_OFFSET = 32;

    uint32_t le32(const uint8_t *p)
    {
        return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) | (static_cast<uint32_t>(p[2]) << 16) |
               (static_cast<uint32_t>(p[3]) << 24);
    }

    void appendLength(std::vector<uint8_t> &out, size_t length)
    {
        if (length < 0x80)
        {
            out.push_back(static_cast<uint8_t>(length));
        }
        else if (length < 0x100)
        {
            out.push_back(0x81);
            out.push_back(static_cast<uint8_t>(length));
        }
        else
        {
            out.push_back(0x82);
            out.push_back(static_cast<uint8_t>(length >> 8));
            out.push_back(static_cast<uint8_t>(length));
        }
    }

    // DER INTEGER of a big-endian unsigned value.
    std::vector<uint8_t> derInteger(const uint8_t *bigEndian, size_t length)
    {
        size_t skip = 0;
        while (skip + 1 < length && bigEndian[skip] == 0)
        {
            skip++;
        }
        std::vector<uint8_t> value;
        if (bigEndian[skip] & 0x80)
        {
            value.push_back(0);
        }
        value.insert(value.end(), bigEndian + skip, bigEndian + length);
        std::vector<uint8_t> out{0x02};
        appendLength(out, value.size());
        out.insert(out.end(), value.begin(), value.end());
        return out;
    }

    // RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER } from the little-endian block fields.
    std::vector<uint8_t> rsaPublicKeyDer(const uint8_t *keyFields)
    {
        uint8_t n[KEY_BYTES];
        for (size_t i = 0; i < KEY_BYTES; i++)
        {
            n[i] = keyFields[KEY_BYTES - 1 - i];
        }
        const uint8_t *eLe = keyFields + KEY_BYTES;
        const uint8_t e[4] = {eLe[3], eLe[2], eLe[1], eLe[0]};
        const std::vector<uint8_t> modulus = derInteger(n, sizeof(n));
        const std::vector<uint8_t> exponent = derInteger(e, sizeof(e));
        std::vector<uint8_t> out{0x30};
        appendLength(out, modulus.size() + exponent.size());
        out.insert(out.end(), modulus.begin(), modulus.end());
        out.insert(out.end(), exponent.begin(), exponent.end());
        return out;
    }

    bool sha256(const uint8_t *data, size_t length, Staging::Digest &out)
    {
        size_t written = 0;
        return psa_hash_compute(PSA_ALG_SHA_256, data, length, out.data(), out.size(), &written) == PSA_SUCCESS &&
               written == out.size();
    }

    bool rsaPssVerify(const uint8_t *keyFields, const Staging::Digest &digest, const uint8_t *signatureLe)
    {
        const std::vector<uint8_t> der = rsaPublicKeyDer(keyFields);
        uint8_t signature[KEY_BYTES];
        for (size_t i = 0; i < KEY_BYTES; i++)
        {
            signature[i] = signatureLe[KEY_BYTES - 1 - i];
        }
        psa_key_attributes_t attributes = PSA_KEY_ATTRIBUTES_INIT;
        psa_set_key_type(&attributes, PSA_KEY_TYPE_RSA_PUBLIC_KEY);
        psa_set_key_bits(&attributes, KEY_BYTES * 8);
        psa_set_key_usage_flags(&attributes, PSA_KEY_USAGE_VERIFY_HASH);
        // espsecure signs with a 32-byte salt, the hash length: exactly what PSA_ALG_RSA_PSS accepts.
        psa_set_key_algorithm(&attributes, PSA_ALG_RSA_PSS(PSA_ALG_SHA_256));
        psa_key_id_t key = 0;
        if (psa_import_key(&attributes, der.data(), der.size(), &key) != PSA_SUCCESS)
        {
            return false;
        }
        const psa_status_t status = psa_verify_hash(key, PSA_ALG_RSA_PSS(PSA_ALG_SHA_256), digest.data(),
                                                    digest.size(), signature, sizeof(signature));
        psa_destroy_key(key);
        return status == PSA_SUCCESS;
    }
}

namespace SignedImage
{
    Result verify(const Read &read, uint32_t size, const std::function<void()> &yield)
    {
        Result result;
        if (size < 2 * SECTOR || size % SECTOR != 0 || psa_crypto_init() != PSA_SUCCESS)
        {
            return result;
        }
        const uint32_t contentSize = size - SECTOR;
        std::unique_ptr<uint8_t[]> buffer(new (std::nothrow) uint8_t[SECTOR]);
        if (!buffer)
        {
            return result;
        }

        psa_hash_operation_t contents = PSA_HASH_OPERATION_INIT;
        psa_hash_operation_t whole = PSA_HASH_OPERATION_INIT;
        bool hashed = psa_hash_setup(&contents, PSA_ALG_SHA_256) == PSA_SUCCESS &&
                      psa_hash_setup(&whole, PSA_ALG_SHA_256) == PSA_SUCCESS;
        uint8_t block[SIG_BLOCK_BYTES];
        for (uint32_t offset = 0; hashed && offset < size; offset += SECTOR)
        {
            if (!read(offset, buffer.get(), SECTOR))
            {
                result.readFailed = true;
                hashed = false;
                break;
            }
            hashed = psa_hash_update(&whole, buffer.get(), SECTOR) == PSA_SUCCESS &&
                     (offset >= contentSize || psa_hash_update(&contents, buffer.get(), SECTOR) == PSA_SUCCESS);
            if (offset == contentSize)
            {
                memcpy(block, buffer.get(), sizeof(block));
            }
            if (yield)
            {
                yield();
            }
        }
        Staging::Digest contentDigest{};
        size_t length = 0;
        hashed = hashed &&
                 psa_hash_finish(&contents, contentDigest.data(), contentDigest.size(), &length) == PSA_SUCCESS &&
                 psa_hash_finish(&whole, result.imageSha256.data(), result.imageSha256.size(), &length) == PSA_SUCCESS;
        psa_hash_abort(&contents);
        psa_hash_abort(&whole);
        if (!hashed)
        {
            return result;
        }

        if (block[0] != SIG_MAGIC || block[1] != SIG_VERSION_RSA ||
            le32(block + CRC_COVERED_BYTES) != Staging::crc32(block, CRC_COVERED_BYTES))
        {
            return result;
        }
        if (!sha256(block + KEY_FIELDS_OFFSET, KEY_FIELDS_BYTES, result.keyDigest))
        {
            return result;
        }
        if (memcmp(block + DIGEST_OFFSET, contentDigest.data(), contentDigest.size()) != 0)
        {
            return result;
        }
        result.signatureValid = rsaPssVerify(block + KEY_FIELDS_OFFSET, contentDigest, block + SIGNATURE_OFFSET);
        return result;
    }

    bool contains(const Read &read, uint32_t size, const std::string &needle, const std::function<void()> &yield)
    {
        if (needle.empty() || needle.size() > SECTOR)
        {
            return false;
        }
        // Each read starts with the tail of the previous one, so a match across a boundary is found too.
        const size_t overlap = needle.size() - 1;
        std::vector<uint8_t> window(SECTOR + overlap);
        size_t carried = 0;
        for (uint32_t offset = 0; offset < size; offset += SECTOR)
        {
            const size_t chunk = size - offset < SECTOR ? size - offset : SECTOR;
            if (!read(offset, window.data() + carried, chunk))
            {
                return false;
            }
            const size_t filled = carried + chunk;
            if (std::search(window.begin(), window.begin() + filled, needle.begin(), needle.end()) !=
                window.begin() + filled)
            {
                return true;
            }
            carried = filled < overlap ? filled : overlap;
            memmove(window.data(), window.data() + filled - carried, carried);
            if (yield)
            {
                yield();
            }
        }
        return false;
    }

    AppInfo appInfo(const Read &read, uint32_t size)
    {
        AppInfo info;
        uint8_t head[APP_DESC_OFFSET + 8];
        if (size < sizeof(head) || !read(0, head, sizeof(head)) || head[0] != IMAGE_MAGIC ||
            le32(head + APP_DESC_OFFSET) != APP_DESC_MAGIC)
        {
            return info;
        }
        info.valid = true;
        info.secureVersion = le32(head + APP_DESC_OFFSET + 4);
        return info;
    }
}
