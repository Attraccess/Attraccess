#include "ds_storage.hpp"

#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)

#include <cstring>

#include "esp_efuse.h"
#include "esp_flash.h"
#include "esp_flash_encrypt.h"
#include "esp_heap_caps.h"
#include "esp_ds.h"
#include "mbedtls/platform_util.h"

static_assert(DsRecord::C_BYTES == ESP_DS_C_LEN, "DS record layout assumes ESP_DS_C_LEN bytes of encrypted parameters");

namespace
{
    // Largest record: header + fixed payload + c + SPKI = 2074 bytes; reads are 16-byte multiples.
    constexpr size_t READ_BYTES = 2176;
    static_assert(READ_BYTES >= DsRecord::HEADER_BYTES + 22 + DsRecord::C_BYTES + 2 + 422 && READ_BYTES % 16 == 0,
                  "record read window");

    bool readWindow(uint8_t *buffer)
    {
        if (esp_efuse_is_flash_encryption_enabled())
        {
            return esp_flash_read_encrypted(nullptr, DsRecord::FLASH_OFFSET, buffer, READ_BYTES) == ESP_OK;
        }
        return esp_flash_read(nullptr, buffer, DsRecord::FLASH_OFFSET, READ_BYTES) == ESP_OK;
    }
}

namespace DsStorage
{
    bool readRaw(std::vector<uint8_t> &out)
    {
        uint8_t *buffer = static_cast<uint8_t *>(heap_caps_malloc(READ_BYTES, MALLOC_CAP_8BIT));
        if (!buffer)
        {
            return false;
        }
        DsRecord::Record record;
        const bool ok = readWindow(buffer) && DsRecord::parse(buffer, READ_BYTES, record);
        if (ok)
        {
            const size_t payload = static_cast<size_t>(buffer[8]) | (static_cast<size_t>(buffer[9]) << 8) |
                                   (static_cast<size_t>(buffer[10]) << 16) | (static_cast<size_t>(buffer[11]) << 24);
            out.assign(buffer, buffer + DsRecord::HEADER_BYTES + payload);
        }
        heap_caps_free(buffer);
        return ok;
    }

    bool read(DsRecord::Record &out)
    {
        std::vector<uint8_t> raw;
        return readRaw(raw) && DsRecord::parse(raw.data(), raw.size(), out);
    }

    bool write(const DsRecord::Record &record)
    {
        std::vector<uint8_t> raw = DsRecord::serialize(record);
        if (raw.empty() || raw.size() > READ_BYTES)
        {
            return false;
        }
        raw.resize(READ_BYTES, 0xFF);
        uint8_t *buffer = static_cast<uint8_t *>(heap_caps_malloc(READ_BYTES, MALLOC_CAP_8BIT));
        if (!buffer)
        {
            return false;
        }
        memcpy(buffer, raw.data(), READ_BYTES);
        bool ok = esp_flash_erase_region(nullptr, DsRecord::FLASH_OFFSET, DsRecord::SECTOR_BYTES) == ESP_OK;
        if (ok)
        {
            ok = esp_efuse_is_flash_encryption_enabled()
                     ? esp_flash_write_encrypted(nullptr, DsRecord::FLASH_OFFSET, buffer, READ_BYTES) == ESP_OK
                     : esp_flash_write(nullptr, buffer, DsRecord::FLASH_OFFSET, READ_BYTES) == ESP_OK;
        }
        mbedtls_platform_zeroize(buffer, READ_BYTES);
        heap_caps_free(buffer);
        return ok;
    }
}
#endif
