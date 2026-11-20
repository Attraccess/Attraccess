#pragma once
#include <cstddef>
#include <cstdint>
#include "reset-reason.hpp"
// Must stay byte-compatible with Application::BootDiagnostics_t, persisted by
// application_bootdiag.cpp. A layout/size mismatch fails the magic/size guard
// below and simply skips the upload, so it can never crash the reader.
struct CrashBootRecord
{
    uint32_t magic;
    uint8_t resetReason;
    uint32_t uptimeMs;
    uint32_t freeInternalHeap;
    uint32_t largestFreeBlock;
    bool websocketConnected;
    bool wifiConnected;
};

#define BOOT_DIAG_NAMESPACE "bootdiag"
#define BOOT_DIAG_PENDING_KEY "pending"
#define BOOT_DIAG_PENDING_REASON_KEY "pendingreason"
#define BOOT_DIAG_REBOOT_REASON_KEY "rebootreason"
// Fingerprint (CrashDumpFingerprint) of the dump last attached to a crash or picked up as an
// orphan: a dump that is still in flash after a later crash must not be attached to that crash.
#define BOOT_DIAG_DUMP_CLAIMED_KEY "cdclaimed"
// Fingerprint of the dump that is finished: the server stored it (erasing it may still have failed)
// or refused it for good. It is never uploaded again.
#define BOOT_DIAG_DUMP_DONE_KEY "cddone"
#define BOOT_DIAG_MAGIC 0x41545431
#define BOOT_DIAG_PENDING_VERSION_1 1
#define BOOT_DIAG_PENDING_VERSION 2

// Size and CRC-32 (zlib polynomial) of a coredump image. size 0 means "no dump".
struct CrashDumpFingerprint
{
    uint32_t size;
    uint32_t crc32;

    bool present() const { return size != 0; }
    bool operator==(const CrashDumpFingerprint &other) const { return size == other.size && crc32 == other.crc32; }
    bool operator!=(const CrashDumpFingerprint &other) const { return !(*this == other); }
};

// Version 1 (firmware before ATT-1144): the crash snapshot and its reset reason.
struct PendingCrashBootRecordV1
{
    CrashBootRecord record;
    uint8_t resetReason;
    uint8_t version;
};

enum class CrashUploadPhase : uint8_t
{
    MetadataPending = 0, // the server has not acknowledged the report yet
    DumpPending = 1,     // the report exists (reportId); its coredump is still owed
};

#define CRASH_PENDING_FLAG_ORPHAN 0x01 // a dump found in flash without its boot record
#define CRASH_FIRMWARE_VERSION_BYTES 32

// Version 2 (ATT-1144) keeps the version 1 prefix, so `version` sits at the same offset.
struct PendingCrashBootRecord
{
    CrashBootRecord record;
    uint8_t resetReason;
    uint8_t version;
    uint8_t phase; // CrashUploadPhase
    uint8_t flags; // CRASH_PENDING_FLAG_*
    CrashDumpFingerprint dump; // the dump that belongs to this crash; size 0 = none
    uint32_t reportId;         // server report id once the metadata was acknowledged, else 0
    char firmwareVersion[CRASH_FIRMWARE_VERSION_BYTES]; // firmware that crashed; "" = unknown
};

// The coredump partition (partitions.csv, coredump 0x20000). No valid dump can be larger.
#define CRASH_COREDUMP_PARTITION_BYTES (128 * 1024)
