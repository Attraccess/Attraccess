#pragma once

#include "efuse_report.hpp"

// Reads the security eFuses of this chip into an EfuseReport::Snapshot (device only: secure builds for the eFuse report,
// plain builds with a conversion client for the preflight report). It only reads. The firmware writes exactly two eFuse
// fields, both during a "Secure this reader" conversion and both in src/api/conversion/conversion_efuse.cpp: the
// step-4 digest burn (KEY0/KEY1) in the plain app and the WR_DIS_RD_DIS lock in the release secure app (step 8).
// Key blocks are never read except KEY0/KEY1 when they hold a Secure Boot digest (public data).
#if defined(ESP_PLATFORM) && (defined(ATTRACTAP_SECURE_BUILD) || defined(ATTRACTAP_CONVERSION_CLIENT))
namespace EfuseSnapshot
{
    EfuseReport::Snapshot read();
    // ESP-IDF purpose name of key block `block` (0..5); "USER" for unused or unknown purposes.
    const char *purposeName(int purpose);
}
#endif
