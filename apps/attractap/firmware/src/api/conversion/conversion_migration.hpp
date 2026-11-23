#pragma once

#include <string>

#include <cstdint>

// Start-up NVS handling with the conversion in mind (ATT-1208), called by main.cpp instead of nvs_flash_init():
//  - Every build: NVS is never erased while a conversion's data waits in the staging region (the reader's P-256
//    key may exist only there). The usual erase-and-retry on NO_FREE_PAGES / NEW_VERSION_FOUND is skipped then.
//  - Secure builds, first boot after the conversion (step 8): the plain app's NVS is replaced by encrypted NVS
//    (nvs_flash_init creates the HMAC key in KEY4, read-protected), the staged namespaces are written and read back,
//    and only then the staging region is erased. Release secure builds then lock RD_DIS (WR_DIS_RD_DIS); the lock is
//    compiled out of secure-lab, demo, debug and test builds (conversion_build.hpp).
// Runs before the display exists: the screen cannot show progress for this sub-second step.
namespace ConversionMigration
{
    // The esp_err_t of the final nvs_flash_init() (int, so the header builds on the host).
    int32_t initNvs();
    // NVS must not be erased now (factory reset, recovery): a conversion's data still waits in the staging region.
    bool nvsErasePermitted();
    // Secure app: `conversion.status` naming the migrated conversion; empty when there is nothing to report.
    std::string statusMessage();
}
