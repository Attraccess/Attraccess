#pragma once

#include "efuse_report.hpp"

// Reads the security eFuses of this chip into an EfuseReport::Snapshot (secure builds, device only).
// Key blocks are never read except KEY0/KEY1 when they hold a Secure Boot digest (public data).
#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)
namespace EfuseSnapshot
{
    EfuseReport::Snapshot read();
    // ESP-IDF purpose name of key block `block` (0..5); "USER" for unused or unknown purposes.
    const char *purposeName(int purpose);
    // The reader's own, informational view of READER_FIRMWARE_INFO.secured: release flash encryption,
    // Secure Boot, the DS key in KEY3 and RD_DIS write-protected. The server never trusts it.
    bool looksSecured();
}
#endif
