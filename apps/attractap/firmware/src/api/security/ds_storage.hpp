#pragma once

#include <cstdint>
#include <vector>

#include "ds_record.hpp"

// Flash access of the DS record: the first 4 KiB sector of the `spiffs` partition (DsRecord::FLASH_OFFSET),
// written and read with flash encryption (esp_flash_write_encrypted / esp_flash_read_encrypted). The
// partition table is unchanged; the firmware never mounts spiffs. T3's conversion staging uses the END of
// the partition (MigrationStaging), so the two never overlap. Secure builds on the device only.
#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)
namespace DsStorage
{
    // The record when the sector holds a valid one.
    bool read(DsRecord::Record &out);
    // The serialized record exactly as stored (no padding), for ds.export and read-back checks.
    bool readRaw(std::vector<uint8_t> &out);
    // Erases the sector and writes the record. The caller reads it back before relying on it.
    bool write(const DsRecord::Record &record);
}
#endif
