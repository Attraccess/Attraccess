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

void API::sendPendingCrashReport()
{
    if (this->crashReportAwaitingAck)
    {
        return;
    }

    PendingCrashBootRecord pending = {};
    KVStore prefs;
    prefs.begin(BOOT_DIAG_NAMESPACE, true);
    size_t read = prefs.getBytes(BOOT_DIAG_PENDING_KEY, &pending, sizeof(pending));
    prefs.end();

    CrashBootRecord rec = {};
    uint8_t pendingReason = 0;
    if (read == sizeof(pending) && pending.version == BOOT_DIAG_PENDING_VERSION &&
        pending.record.magic == BOOT_DIAG_MAGIC)
    {
        rec = pending.record;
        pendingReason = pending.resetReason;
    }
    else if (read == sizeof(rec))
    {
        memcpy(&rec, &pending, sizeof(rec));
        if (rec.magic != BOOT_DIAG_MAGIC)
        {
            return;
        }

        KVStore legacyPrefs;
        legacyPrefs.begin(BOOT_DIAG_NAMESPACE, true);
        uint8_t legacyReason = legacyPrefs.getUChar(BOOT_DIAG_PENDING_REASON_KEY, 0);
        legacyPrefs.end();

        if (legacyReason == ESP_RST_SW)
        {
            // Legacy records stored the reset reason separately. An intentional
            // software reset is not crash telemetry, so discard this old pair.
            legacyPrefs.begin(BOOT_DIAG_NAMESPACE, false);
            legacyPrefs.remove(BOOT_DIAG_PENDING_KEY);
            legacyPrefs.remove(BOOT_DIAG_PENDING_REASON_KEY);
            legacyPrefs.end();
            return;
        }
        else if (legacyReason != 0)
        {
            pendingReason = legacyReason;
        }
        else if (esp_reset_reason() == ESP_RST_SW)
        {
            legacyPrefs.begin(BOOT_DIAG_NAMESPACE, false);
            legacyPrefs.remove(BOOT_DIAG_PENDING_KEY);
            legacyPrefs.remove(BOOT_DIAG_PENDING_REASON_KEY);
            legacyPrefs.end();
            return;
        }
        else
        {
            pendingReason = (uint8_t)esp_reset_reason();
        }
    }
    else
    {
        return;
    }
    const char *resetStr = crashResetReasonToString(pendingReason);

    // Optional deliberate-reboot reason left behind by the firmware before it
    // rebooted itself (e.g. the websocket reconnect heap-recovery reboot). Absent
    // for ordinary/unexpected resets, in which case the field is omitted.
    std::string rebootReason;
    {
        KVStore reasonPrefs;
        reasonPrefs.begin(BOOT_DIAG_NAMESPACE, true);
        rebootReason = reasonPrefs.getString(BOOT_DIAG_REBOOT_REASON_KEY);
        reasonPrefs.end();
    }

    size_t b64Len = 0;
    std::unique_ptr<char[]> coredump = readCoredumpBase64(this->logger, b64Len);
    this->crashReportSentCoredump = (bool)coredump;

    this->logger.infof("Uploading crash report: reset=%s rebootReason=%s uptime=%ums heap=%u coredump=%s",
                       resetStr, rebootReason.empty() ? "(none)" : rebootReason.c_str(), rec.uptimeMs,
                       rec.freeInternalHeap, coredump ? "yes" : "no");

    // Build the event manually into a single heap buffer: an oversized coredump
    // base64 string would otherwise be copied several times through ArduinoJson.
    const char *ws = rec.websocketConnected ? "CONNECTED" : "DISCONNECTED";
    const char *wifi = rec.wifiConnected ? "CONNECTED" : "DISCONNECTED";

    char rebootReasonField[96] = {0};
    if (!rebootReason.empty())
    {
        snprintf(rebootReasonField, sizeof(rebootReasonField), ",\"rebootReason\":\"%s\"", rebootReason.c_str());
    }

    char head[416];
    int headLen = snprintf(
        head, sizeof(head),
        "{\"event\":\"EVENT\",\"data\":{\"type\":\"READER_CRASH_REPORT\",\"payload\":{"
        "\"resetReason\":\"%s\",\"heapFreeBytes\":%u,\"largestFreeBlockBytes\":%u,"
        "\"uptimeBeforeResetMs\":%u,\"wsState\":\"%s\",\"wifiState\":\"%s\",\"firmwareVersion\":\"%s\"%s",
        resetStr, (unsigned)rec.freeInternalHeap, (unsigned)rec.largestFreeBlock,
        (unsigned)rec.uptimeMs, ws, wifi, FIRMWARE_VERSION, rebootReasonField);
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

    this->transport.sendMessage(buf.get(), pos);
    this->crashReportAwaitingAck = true;
}
#else
void API::sendPendingCrashReport() {}
#endif
