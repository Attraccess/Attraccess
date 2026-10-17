#pragma once
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
#define BOOT_DIAG_MAGIC 0x41545431
#define BOOT_DIAG_PENDING_VERSION 1

struct PendingCrashBootRecord
{
    CrashBootRecord record;
    uint8_t resetReason;
    uint8_t version;
};

// Cap the coredump we are willing to base64-encode and hold in RAM at once.
// Larger dumps stay in flash (readable over USB on the bench) and only the
// record is uploaded, so we never exhaust the internal heap on a reader.
#define CRASH_COREDUMP_MAX_BYTES (32 * 1024)


const char *crashResetReasonToString(uint8_t reason);
std::unique_ptr<char[]> readCoredumpBase64(Logger &logger, size_t &b64Len);
