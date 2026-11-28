#pragma once

#include <string>

#include <cstdint>

// Start-up NVS handling with the conversion in mind (ATT-1208), called by main.cpp instead of nvs_flash_init():
//  - Every build: NVS is never erased while a conversion's data waits in the staging region (the reader's P-256
//    key may exist only there). The usual erase-and-retry on NO_FREE_PAGES / NEW_VERSION_FOUND is skipped then.
//  - Secure builds, first boot after the conversion (step 8): the plain app's NVS is replaced by encrypted NVS
//    (nvs_flash_init creates the HMAC key in KEY4, read-protected), the staged namespaces are written and read back,
//    and only then the staging region is erased. Release secure builds then lock RD_DIS (WR_DIS_RD_DIS); the lock is
//    compiled out of secure-lab, demo, debug and test builds (conversion_build.hpp). Only on a chip with Secure Boot
//    and flash encryption on; a restart after the migration only finishes the staging erase (migration_plan.hpp).
// Runs at the top of app_main, before Settings and the display exist (Display::setup() needs the I/O expander, the
// I2C bus and the settings this step restores), so no screen can be shown for it. It takes a few seconds at most.
// The flash encryption before it runs in the bootloader, which has no display driver either: the last screen the
// reader shows before both is the plain app's "Don't unplug" for the bootloader write and the restart
// (ConversionUi::Phase::Bootloader, with the hint that restart and encryption take a few minutes).
namespace ConversionMigration
{
    // The esp_err_t of the final nvs_flash_init() (int, so the header builds on the host).
    int32_t initNvs();
    // NVS must not be erased now (factory reset, recovery): a conversion's data still waits in the staging region.
    bool nvsErasePermitted();
    // Secure app: `conversion.status` naming the migrated conversion; empty when there is nothing to report.
    std::string statusMessage();
}
