#pragma once

#include <cstdint>

// What the secure app does with NVS at start-up (step 8 of ATT-1208), as pure decisions: conversion_migration.cpp
// reads the facts from flash, eFuses and NVS, host tests (tests/secure-conversion) check the decisions.
namespace MigrationPlan
{
    // The secure app's marker in encrypted NVS (namespace "conversion"): which conversion, and how far it got.
    enum MarkerStage : uint8_t
    {
        MIGRATING = 1, // entries written and read back; the staging wipe and the RD_DIS lock may still be due
        MIGRATED = 2,  // done, lock included where the build has it
        FAILED = 3,    // the entries did not read back; the staged backup stays for the next boot
    };

    enum class Start : uint8_t
    {
        Normal,     // no staged conversion (or not a secure build): the usual NVS init
        NotSecured, // staged conversion, but the chip runs without Secure Boot or flash encryption: touch nothing
        Migrate,    // restore the staged backup into encrypted NVS, then wipe the staging region
        FinishWipe, // already migrated before a power cut: only finish the staging wipe (and the RD_DIS lock)
    };

    // The encrypted NVS already holds the restored entries of this conversion. Only then may the staged backup be
    // given up without restoring it: a half-wiped staging region can no longer be restored from.
    constexpr bool alreadyMigrated(bool haveMarker, uint32_t markerId, uint8_t markerStage, uint32_t conversionId)
    {
        return haveMarker && markerId == conversionId && (markerStage == MIGRATING || markerStage == MIGRATED);
    }

    // `staged`: the staging region has a valid header. `chipSecured`: Secure Boot and flash encryption are both on.
    constexpr Start start(bool migrationBuild, bool staged, bool chipSecured, bool migrated)
    {
        if (!migrationBuild || !staged)
            return Start::Normal;
        // A secure app on a chip without Secure Boot and flash encryption (a power cut after the boot partition was
        // switched, before the secure bootloader was in place): no encrypted NVS (it would burn the HMAC key), no
        // RD_DIS lock, no wipe. The plain NVS and the staged backup stay for a USB recovery.
        if (!chipSecured)
            return Start::NotSecured;
        return migrated ? Start::FinishWipe : Start::Migrate;
    }
}
