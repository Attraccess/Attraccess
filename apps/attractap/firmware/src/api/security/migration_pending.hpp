#pragma once

#include <cstddef>
#include <cstdint>

// T3 hook (ATT-1208). "Secure this reader" over the air stages its conversion data at the END of the
// `spiffs` partition (the DS record sits in the first sector of it). While that staging area holds
// data a conversion still needs, start-up must not erase the NVS.
//
// ATT-1207 only defines the check: a staging header with this magic at the start of the last sector
// of the partition means "migration pending". No staging area exists yet, so it returns false.
// T3 owns the staging layout and may extend the check; keep the call site in main.cpp.
namespace MigrationStaging
{
    constexpr uint32_t SPIFFS_OFFSET = 0xc90000;
    constexpr uint32_t SPIFFS_SIZE = 0x350000;
    constexpr size_t SECTOR_BYTES = 4096;
    // Header sector of the staging area: the last sector of the partition.
    constexpr uint32_t HEADER_OFFSET = SPIFFS_OFFSET + SPIFFS_SIZE - SECTOR_BYTES;
    constexpr uint8_t MAGIC[4] = {'A', 'T', 'M', 'G'};

    // Pure part (host tested): does this sector start with the staging magic?
    bool headerPresent(const uint8_t *sector, size_t length);
}

// Device: reads the staging header sector (encrypted flash read on secure builds) and applies
// MigrationStaging::headerPresent. False when it cannot be read: erasing is then decided by the
// remaining rules, and a failed read never invents a pending migration.
bool migrationPending();
