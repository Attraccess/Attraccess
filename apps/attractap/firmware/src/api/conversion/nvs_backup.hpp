#pragma once

#include <vector>

#include "nvs_backup_codec.hpp"

// Reading the migrated namespaces out of NVS (plain app, step 2) and writing them into the encrypted NVS of the
// secure app (step 8). Device only; on the host both fail. Values are never logged.
namespace NvsBackupStore
{
    // Every entry of NvsBackup::NAMESPACES, in NVS iteration order.
    bool collect(std::vector<NvsBackup::Entry> &out);
    // Writes the entries and commits. Entries already present are overwritten.
    bool restore(const std::vector<NvsBackup::Entry> &entries);
    // Reads every entry of `expected` back and compares the values.
    bool matches(const std::vector<NvsBackup::Entry> &expected);
}
