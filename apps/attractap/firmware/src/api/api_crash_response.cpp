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
    KVStore prefs;
    prefs.begin(BOOT_DIAG_NAMESPACE, false);
    prefs.remove(BOOT_DIAG_PENDING_KEY);
    prefs.remove(BOOT_DIAG_PENDING_REASON_KEY);
    prefs.remove(BOOT_DIAG_REBOOT_REASON_KEY);
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
void API::onCrashReportResponse(JsonObject) {}
#endif
