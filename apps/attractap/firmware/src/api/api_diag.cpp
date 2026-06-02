// Upload persisted boot/crash record + coredump blob on next successful connect
// FEATURE: api-diag

#include "api.hpp"

#ifdef ESP_PLATFORM
#include <Preferences.h>
#include <memory>
#include "esp_system.h"
#include "esp_heap_caps.h"
#include "esp_partition.h"
#include "esp_core_dump.h"
#include "mbedtls/base64.h"

// Must stay byte-compatible with Application::BootDiagnostics_t, persisted by
// application_bootdiag.cpp. A layout/size mismatch fails the magic/size guard
// below and simply skips the upload, so it can never crash the reader.
struct CrashBootRecord
{
    uint32_t magic;
    uint8_t resetReason;
    uint32_t uptimeMs;
    uint32_t freeInternalHeap;
    uint32_t largestFreeBlock;
    bool websocketConnected;
    bool wifiConnected;
};

#define BOOT_DIAG_NAMESPACE "bootdiag"
#define BOOT_DIAG_PENDING_KEY "pending"
#define BOOT_DIAG_MAGIC 0x41545431

// Cap the coredump we are willing to base64-encode and hold in RAM at once.
// Larger dumps stay in flash (readable over USB on the bench) and only the
// record is uploaded, so we never exhaust the internal heap on a reader.
#define CRASH_COREDUMP_MAX_BYTES (32 * 1024)

static const char *crashResetReasonToString(uint8_t reason)
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
static std::unique_ptr<char[]> readCoredumpBase64(Logger &logger, size_t &b64Len)
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

void API::sendPendingCrashReport()
{
    if (this->crashReportAwaitingAck)
    {
        return;
    }

    CrashBootRecord rec = {0};
    Preferences prefs;
    prefs.begin(BOOT_DIAG_NAMESPACE, true);
    size_t read = prefs.getBytes(BOOT_DIAG_PENDING_KEY, &rec, sizeof(rec));
    prefs.end();
    if (read != sizeof(rec) || rec.magic != BOOT_DIAG_MAGIC)
    {
        return;
    }

    const char *resetStr = crashResetReasonToString(rec.resetReason);

    size_t b64Len = 0;
    std::unique_ptr<char[]> coredump = readCoredumpBase64(this->logger, b64Len);
    this->crashReportSentCoredump = (bool)coredump;

    this->logger.infof("Uploading crash report: reset=%s uptime=%ums heap=%u coredump=%s",
                       resetStr, rec.uptimeMs, rec.freeInternalHeap, coredump ? "yes" : "no");

    // Build the event manually into a single heap buffer: an oversized coredump
    // base64 string would otherwise be copied several times through ArduinoJson.
    const char *ws = rec.websocketConnected ? "CONNECTED" : "DISCONNECTED";
    const char *wifi = rec.wifiConnected ? "CONNECTED" : "DISCONNECTED";

    char head[320];
    int headLen = snprintf(
        head, sizeof(head),
        "{\"event\":\"EVENT\",\"data\":{\"type\":\"READER_CRASH_REPORT\",\"payload\":{"
        "\"resetReason\":\"%s\",\"heapFreeBytes\":%u,\"largestFreeBlockBytes\":%u,"
        "\"uptimeBeforeResetMs\":%u,\"wsState\":\"%s\",\"wifiState\":\"%s\",\"firmwareVersion\":\"%s\"",
        resetStr, (unsigned)rec.freeInternalHeap, (unsigned)rec.largestFreeBlock,
        (unsigned)rec.uptimeMs, ws, wifi, FIRMWARE_VERSION);
    if (headLen <= 0 || headLen >= (int)sizeof(head))
    {
        this->logger.error("Failed to format crash report header");
        return;
    }

    const char *coredumpKey = ",\"coredumpBase64\":\"";
    const char *tailWithCoredump = "\"}}}";
    const char *tailPlain = "}}}";

    size_t total = (size_t)headLen + 1;
    if (coredump)
    {
        total += strlen(coredumpKey) + b64Len + strlen(tailWithCoredump);
    }
    else
    {
        total += strlen(tailPlain);
    }

    std::unique_ptr<char[]> buf(new (std::nothrow) char[total]);
    if (!buf)
    {
        this->logger.error("Failed to allocate crash report buffer");
        return;
    }

    size_t pos = 0;
    memcpy(buf.get() + pos, head, headLen);
    pos += headLen;
    if (coredump)
    {
        memcpy(buf.get() + pos, coredumpKey, strlen(coredumpKey));
        pos += strlen(coredumpKey);
        memcpy(buf.get() + pos, coredump.get(), b64Len);
        pos += b64Len;
        memcpy(buf.get() + pos, tailWithCoredump, strlen(tailWithCoredump));
        pos += strlen(tailWithCoredump);
    }
    else
    {
        memcpy(buf.get() + pos, tailPlain, strlen(tailPlain));
        pos += strlen(tailPlain);
    }
    buf.get()[pos] = '\0';

    this->websocket.sendMessage(buf.get(), pos);
    this->crashReportAwaitingAck = true;
}

void API::onCrashReportResponse(JsonObject data)
{
    JsonObject payload = data["payload"].as<JsonObject>();
    bool received = !payload.isNull() && payload["received"].is<bool>() && payload["received"].as<bool>();
    if (!received)
    {
        this->logger.error("Crash report rejected by server; keeping record for next boot");
        this->crashReportAwaitingAck = false;
        return;
    }

    this->logger.info("Crash report accepted; clearing stored record");
    Preferences prefs;
    prefs.begin(BOOT_DIAG_NAMESPACE, false);
    prefs.remove(BOOT_DIAG_PENDING_KEY);
    prefs.end();

    if (this->crashReportSentCoredump)
    {
        esp_err_t err = esp_core_dump_image_erase();
        if (err != ESP_OK)
        {
            this->logger.errorf("esp_core_dump_image_erase failed: %s", esp_err_to_name(err));
        }
    }

    this->crashReportAwaitingAck = false;
}

#else

void API::sendPendingCrashReport() {}
void API::onCrashReportResponse(JsonObject) {}

#endif
