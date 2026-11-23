#include "staging_format.hpp"

#include <cstring>

namespace
{
    constexpr uint8_t MAGIC[4] = {'A', 'T', 'S', 'C'};
    constexpr uint8_t NVS_MAGIC[4] = {'A', 'T', 'S', 'N'};
    constexpr uint8_t VERIFIED_MAGIC[4] = {'A', 'T', 'S', 'V'};

    void put32(uint8_t *out, uint32_t value)
    {
        for (int i = 0; i < 4; i++)
        {
            out[i] = static_cast<uint8_t>(value >> (8 * i));
        }
    }

    uint32_t get32(const uint8_t *in)
    {
        return static_cast<uint32_t>(in[0]) | (static_cast<uint32_t>(in[1]) << 8) |
               (static_cast<uint32_t>(in[2]) << 16) | (static_cast<uint32_t>(in[3]) << 24);
    }

    // A writer over a fixed buffer, little-endian.
    struct Out
    {
        uint8_t *at;
        void u32(uint32_t value)
        {
            put32(at, value);
            at += 4;
        }
        void bytes(const uint8_t *data, size_t length)
        {
            memcpy(at, data, length);
            at += length;
        }
    };

    struct In
    {
        const uint8_t *at;
        uint32_t u32()
        {
            const uint32_t value = get32(at);
            at += 4;
            return value;
        }
        void bytes(uint8_t *out, size_t length)
        {
            memcpy(out, at, length);
            at += length;
        }
    };

    int nibble(char c)
    {
        if (c >= '0' && c <= '9')
            return c - '0';
        if (c >= 'a' && c <= 'f')
            return c - 'a' + 10;
        if (c >= 'A' && c <= 'F')
            return c - 'A' + 10;
        return -1;
    }
}

namespace Staging
{
    uint32_t crc32(const uint8_t *data, size_t length, uint32_t crc)
    {
        crc = ~crc;
        for (size_t i = 0; i < length; i++)
        {
            crc ^= data[i];
            for (int bit = 0; bit < 8; bit++)
            {
                crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
            }
        }
        return ~crc;
    }

    void encodeHeader(const Header &header, uint8_t out[HEADER_BYTES])
    {
        memset(out, 0, HEADER_BYTES);
        Out w{out};
        w.bytes(MAGIC, sizeof(MAGIC));
        w.u32(HEADER_VERSION);
        w.u32(header.conversionId);
        w.bytes(header.digest0.data(), 32);
        w.bytes(header.digest1.data(), 32);
        w.u32(header.appSize);
        w.bytes(header.appSha256.data(), 32);
        w.u32(header.bootloaderSize);
        w.bytes(header.bootloaderSha256.data(), 32);
        w.u32(header.appSlotOffset);
        put32(out + HEADER_BYTES - 4, crc32(out, HEADER_BYTES - 4));
    }

    bool decodeHeader(const uint8_t *data, size_t length, Header &out)
    {
        if (length < HEADER_BYTES || memcmp(data, MAGIC, sizeof(MAGIC)) != 0 ||
            get32(data + HEADER_BYTES - 4) != crc32(data, HEADER_BYTES - 4))
        {
            return false;
        }
        In r{data + sizeof(MAGIC)};
        if (r.u32() != HEADER_VERSION)
        {
            return false;
        }
        Header h;
        h.conversionId = r.u32();
        r.bytes(h.digest0.data(), 32);
        r.bytes(h.digest1.data(), 32);
        h.appSize = r.u32();
        r.bytes(h.appSha256.data(), 32);
        h.bootloaderSize = r.u32();
        r.bytes(h.bootloaderSha256.data(), 32);
        h.appSlotOffset = r.u32();
        if (h.conversionId == 0 || h.appSize == 0 || h.appSize > APP_SLOT_MAX || h.bootloaderSize == 0 ||
            h.bootloaderSize > BOOTLOADER_MAX || h.appSlotOffset % SECTOR != 0)
        {
            return false;
        }
        out = h;
        return true;
    }

    bool sameTransfer(const Header &a, const Header &b)
    {
        return a.conversionId == b.conversionId && a.digest0 == b.digest0 && a.digest1 == b.digest1 &&
               a.appSize == b.appSize && a.appSha256 == b.appSha256 && a.bootloaderSize == b.bootloaderSize &&
               a.bootloaderSha256 == b.bootloaderSha256 && a.appSlotOffset == b.appSlotOffset;
    }

    void encodeNvsRecord(const NvsRecord &record, uint8_t out[NVS_RECORD_BYTES])
    {
        Out w{out};
        w.bytes(NVS_MAGIC, sizeof(NVS_MAGIC));
        w.u32(record.length);
        w.bytes(record.sha256.data(), 32);
        // 40 bytes: magic, length, hash. The hash itself protects the content; the magic + length check below
        // rejects erased flash.
    }

    bool decodeNvsRecord(const uint8_t *data, size_t length, NvsRecord &out)
    {
        if (length < NVS_RECORD_BYTES || memcmp(data, NVS_MAGIC, sizeof(NVS_MAGIC)) != 0)
        {
            return false;
        }
        In r{data + sizeof(NVS_MAGIC)};
        NvsRecord record;
        record.length = r.u32();
        r.bytes(record.sha256.data(), 32);
        if (record.length == 0 || record.length > NVS_MAX)
        {
            return false;
        }
        out = record;
        return true;
    }

    void encodeVerified(uint32_t conversionId, uint8_t out[VERIFIED_RECORD_BYTES])
    {
        Out w{out};
        w.bytes(VERIFIED_MAGIC, sizeof(VERIFIED_MAGIC));
        w.u32(conversionId);
        w.u32(~conversionId);
    }

    bool decodeVerified(const uint8_t *data, size_t length, uint32_t conversionId)
    {
        return length >= VERIFIED_RECORD_BYTES && memcmp(data, VERIFIED_MAGIC, sizeof(VERIFIED_MAGIC)) == 0 &&
               get32(data + 4) == conversionId && get32(data + 8) == ~conversionId;
    }

    uint32_t chunksDone(const uint8_t *bitmap, size_t bitmapBytes, uint32_t chunks)
    {
        uint32_t done = 0;
        while (done < chunks && done / 8 < bitmapBytes && (bitmap[done / 8] & (1u << (done % 8))) == 0)
        {
            done++;
        }
        return done;
    }

    uint8_t markDone(uint8_t current, uint32_t chunk)
    {
        return static_cast<uint8_t>(current & ~(1u << (chunk % 8)));
    }

    bool parseDigest(const char *hex, Digest &out)
    {
        if (!hex || strlen(hex) != 64)
        {
            return false;
        }
        Digest digest{};
        for (size_t i = 0; i < 32; i++)
        {
            const int hi = nibble(hex[2 * i]);
            const int lo = nibble(hex[2 * i + 1]);
            if (hi < 0 || lo < 0)
            {
                return false;
            }
            digest[i] = static_cast<uint8_t>((hi << 4) | lo);
        }
        out = digest;
        return true;
    }

    std::string hex(const uint8_t *data, size_t length)
    {
        static const char digits[] = "0123456789abcdef";
        std::string out;
        out.reserve(length * 2);
        for (size_t i = 0; i < length; i++)
        {
            out.push_back(digits[data[i] >> 4]);
            out.push_back(digits[data[i] & 0x0f]);
        }
        return out;
    }
}
