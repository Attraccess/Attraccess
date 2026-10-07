// Upload persisted boot/crash record + coredump blob on next successful connect
// FEATURE: api-diag

#include "api.hpp"
#include <cstdio>

#ifdef ESP_PLATFORM
#include "settings/kvstore.hpp"
#include <cstring>
#include <memory>
#include <string>
#include "esp_system.h"
#include "esp_heap_caps.h"
#include "esp_partition.h"
#include "esp_core_dump.h"
#include "mbedtls/base64.h"

#include "api_crash_record.hpp"

const char *crashResetReasonToString(uint8_t reason)
{
    switch ((esp_reset_reason_t)reason)
    {
    case ESP_RST_POWERON:
        return "POWERON";
    case ESP_RST_EXT:
        return "EXT";
    case ESP_RST_SW:
        return "SW";
    case ESP_RST_PANIC:
        return "PANIC";
    case ESP_RST_INT_WDT:
        return "INT_WDT";
    case ESP_RST_TASK_WDT:
        return "TASK_WDT";
    case ESP_RST_WDT:
        return "WDT";
    case ESP_RST_DEEPSLEEP:
        return "DEEPSLEEP";
    case ESP_RST_BROWNOUT:
        return "BROWNOUT";
    case ESP_RST_SDIO:
        return "SDIO";
    default:
        return "UNKNOWN";
    }
}

// Read the stored coredump, base64-encode it into a heap buffer, and return it
// (null when absent, too large, or the heap is too low). b64Len excludes the
// trailing terminator written by mbedtls.
std::unique_ptr<char[]> readCoredumpBase64(Logger &logger, size_t &b64Len)
{
    b64Len = 0;
    size_t addr = 0;
    size_t size = 0;
    if (esp_core_dump_image_get(&addr, &size) != ESP_OK || size == 0)
    {
        return nullptr;
    }
    if (size > CRASH_COREDUMP_MAX_BYTES)
    {
        logger.errorf("Coredump too large to upload (%u bytes); kept in flash", (unsigned)size);
        return nullptr;
    }

    const esp_partition_t *part = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_COREDUMP, NULL);
    if (!part)
    {
        logger.error("Coredump partition not found");
        return nullptr;
    }

    size_t encodedLen = 0;
    mbedtls_base64_encode(NULL, 0, &encodedLen, NULL, size);

    // The encoded blob is held by both this buffer and the outgoing message
    // buffer at once, so reserve generous headroom (8-bit heap covers PSRAM
    // when enabled, which is where these large allocations land).
    uint32_t freeHeap = (uint32_t)heap_caps_get_free_size(MALLOC_CAP_8BIT);
    if (freeHeap < size + 3 * encodedLen + 16384)
    {
        logger.errorf("Insufficient heap for coredump upload (free=%u need~%u)",
                      (unsigned)freeHeap, (unsigned)(size + 3 * encodedLen));
        return nullptr;
    }

    std::unique_ptr<uint8_t[]> raw(new (std::nothrow) uint8_t[size]);
    std::unique_ptr<char[]> encoded(new (std::nothrow) char[encodedLen]);
    if (!raw || !encoded)
    {
        logger.error("Coredump buffer allocation failed");
        return nullptr;
    }
    if (esp_partition_read(part, 0, raw.get(), size) != ESP_OK)
    {
        logger.error("Coredump partition read failed");
        return nullptr;
    }

    size_t written = 0;
    if (mbedtls_base64_encode((unsigned char *)encoded.get(), encodedLen, &written, raw.get(), size) != 0)
    {
        logger.error("Coredump base64 encode failed");
        return nullptr;
    }
    b64Len = written;
    return encoded;
}
#endif
