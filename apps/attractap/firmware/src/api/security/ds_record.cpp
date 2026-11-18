#include "ds_record.hpp"

#include <cstring>

#include "psa/crypto.h"
#include "rsa_der.hpp"

namespace
{
    constexpr uint8_t MAGIC[4] = {'A', 'T', 'D', 'S'};
    // key block + reserved + rsa length + iv + c length + spki length
    constexpr size_t FIXED_PAYLOAD_BYTES = 1 + 1 + 2 + DsRecord::IV_BYTES + 2 + 2;

    void put16(std::vector<uint8_t> &out, uint16_t value)
    {
        out.push_back(static_cast<uint8_t>(value));
        out.push_back(static_cast<uint8_t>(value >> 8));
    }

    uint16_t get16(const uint8_t *p) { return static_cast<uint16_t>(p[0] | (p[1] << 8)); }

    uint32_t get32(const uint8_t *p)
    {
        return static_cast<uint32_t>(p[0]) | (static_cast<uint32_t>(p[1]) << 8) | (static_cast<uint32_t>(p[2]) << 16) |
               (static_cast<uint32_t>(p[3]) << 24);
    }

    bool sha256(const uint8_t *data, size_t length, uint8_t out[32])
    {
        size_t written = 0;
        return psa_crypto_init() == PSA_SUCCESS &&
               psa_hash_compute(PSA_ALG_SHA_256, data, length, out, 32, &written) == PSA_SUCCESS && written == 32;
    }
}

namespace DsRecord
{
    std::vector<uint8_t> serialize(const Record &record)
    {
        if (record.keyBlock > 5 || record.rsaLength != RSA_LENGTH_FIELD || record.c.size() != C_BYTES ||
            !RsaDer::isCanonicalRsa3072Spki(record.spki))
        {
            return {};
        }
        std::vector<uint8_t> payload;
        payload.push_back(record.keyBlock);
        payload.push_back(0);
        put16(payload, record.rsaLength);
        payload.insert(payload.end(), record.iv, record.iv + IV_BYTES);
        put16(payload, static_cast<uint16_t>(record.c.size()));
        payload.insert(payload.end(), record.c.begin(), record.c.end());
        put16(payload, static_cast<uint16_t>(record.spki.size()));
        payload.insert(payload.end(), record.spki.begin(), record.spki.end());

        std::vector<uint8_t> out(MAGIC, MAGIC + sizeof(MAGIC));
        put16(out, VERSION);
        put16(out, 0);
        const uint32_t length = static_cast<uint32_t>(payload.size());
        for (int shift = 0; shift < 32; shift += 8)
        {
            out.push_back(static_cast<uint8_t>(length >> shift));
        }
        uint8_t digest[32];
        if (!sha256(payload.data(), payload.size(), digest))
        {
            return {};
        }
        out.insert(out.end(), digest, digest + sizeof(digest));
        out.insert(out.end(), payload.begin(), payload.end());
        return out;
    }

    bool parse(const uint8_t *data, size_t length, Record &out)
    {
        if (!data || length < HEADER_BYTES || memcmp(data, MAGIC, sizeof(MAGIC)) != 0 ||
            get16(data + 4) != VERSION || get16(data + 6) != 0)
        {
            return false;
        }
        const size_t payloadLength = get32(data + 8);
        if (payloadLength < FIXED_PAYLOAD_BYTES || payloadLength > SECTOR_BYTES - HEADER_BYTES ||
            length - HEADER_BYTES < payloadLength)
        {
            return false;
        }
        const uint8_t *payload = data + HEADER_BYTES;
        uint8_t digest[32];
        if (!sha256(payload, payloadLength, digest) || memcmp(digest, data + 12, sizeof(digest)) != 0)
        {
            return false;
        }
        Record record;
        record.keyBlock = payload[0];
        record.rsaLength = get16(payload + 2);
        memcpy(record.iv, payload + 4, IV_BYTES);
        const size_t cLength = get16(payload + 4 + IV_BYTES);
        const size_t cOffset = 4 + IV_BYTES + 2;
        if (payload[1] != 0 || record.keyBlock > 5 || record.rsaLength != RSA_LENGTH_FIELD || cLength != C_BYTES ||
            payloadLength != FIXED_PAYLOAD_BYTES + cLength + RsaDer::SPKI_BYTES ||
            get16(payload + cOffset + cLength) != RsaDer::SPKI_BYTES)
        {
            return false;
        }
        record.c.assign(payload + cOffset, payload + cOffset + cLength);
        record.spki.assign(payload + cOffset + cLength + 2, payload + payloadLength);
        if (!RsaDer::isCanonicalRsa3072Spki(record.spki))
        {
            return false;
        }
        out = std::move(record);
        return true;
    }
}
