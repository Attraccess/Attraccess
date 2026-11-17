// Reader side of the crash report upload: NVS, coredump flash and heap ports for coredump-upload.cpp
// FEATURE: api-diag

#include "crash-report.hpp"
#include <algorithm>
#include <cstring>

#ifdef ESP_PLATFORM
#include "../../settings/kvstore.hpp"
#include "esp_system.h"
#include "esp_heap_caps.h"
#include "esp_partition.h"
#include "esp_rom_crc.h"
#include "sdkconfig.h"
#if CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH
#include "esp_core_dump.h" // absent when coredumps are off (secure profile)
#endif

const char *crashResetReasonToString(uint8_t reason)
{
    switch ((esp_reset_reason_t)reason)
    {
    case ESP_RST_POWERON:
        return "POWERON";
    case ESP_RST_EXT:
        return "EXT";
    case ESP_RST_SW:
        return "SW";
    case ESP_RST_PANIC:
        return "PANIC";
    case ESP_RST_INT_WDT:
        return "INT_WDT";
    case ESP_RST_TASK_WDT:
        return "TASK_WDT";
    case ESP_RST_WDT:
        return "WDT";
    case ESP_RST_DEEPSLEEP:
        return "DEEPSLEEP";
    case ESP_RST_BROWNOUT:
        return "BROWNOUT";
    case ESP_RST_SDIO:
        return "SDIO";
    case ESP_RST_USB:
        return "USB"; // USB-Serial-JTAG chip reset, e.g. a host DTR/RTS (esptool) reset
    case ESP_RST_JTAG:
        return "JTAG";
    case ESP_RST_EFUSE:
        return "EFUSE";
    case ESP_RST_PWR_GLITCH:
        return "PWR_GLITCH";
    case ESP_RST_CPU_LOCKUP:
        return "CPU_LOCKUP"; // double exception, e.g. a stack overflow
    default:
        return "UNKNOWN";
    }
}

bool crashResetIsCrash(uint8_t reason)
{
    switch ((esp_reset_reason_t)reason)
    {
    case ESP_RST_PANIC:
    case ESP_RST_TASK_WDT:
    case ESP_RST_INT_WDT:
    case ESP_RST_WDT:
    case ESP_RST_CPU_LOCKUP:
        return true;
    default:
        return false;
    }
}

namespace
{
// The dump in flash cannot change while the firmware runs (only a crash writes one), so its
// fingerprint is read once per boot and forgotten when the dump is erased.
#if CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH
bool cachedFlashDumpKnown = false;
#endif
CrashDumpFingerprint cachedFlashDump = {};

CrashDumpFingerprint readFingerprint(const char *key)
{
    CrashDumpFingerprint fingerprint = {};
    KVStore prefs;
    prefs.begin(BOOT_DIAG_NAMESPACE, true);
    if (prefs.getBytes(key, &fingerprint, sizeof(fingerprint)) != sizeof(fingerprint))
    {
        fingerprint = {};
    }
    prefs.end();
    return fingerprint;
}

void writeFingerprint(const char *key, const CrashDumpFingerprint &fingerprint)
{
    KVStore prefs;
    prefs.begin(BOOT_DIAG_NAMESPACE, false);
    prefs.putBytes(key, &fingerprint, sizeof(fingerprint));
    prefs.end();
}

#if CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH
const esp_partition_t *coredumpPartition()
{
    return esp_partition_find_first(ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_COREDUMP, NULL);
}

// Small reads keep the flash bus free for the RGB panel's PSRAM framebuffer.
constexpr size_t COREDUMP_READ_PIECE_BYTES = 512;

bool readCoredumpPartition(const esp_partition_t *part, size_t offset, uint8_t *out, size_t length)
{
    for (size_t done = 0; done < length; done += COREDUMP_READ_PIECE_BYTES)
    {
        const size_t piece = length - done < COREDUMP_READ_PIECE_BYTES ? length - done : COREDUMP_READ_PIECE_BYTES;
        if (esp_partition_read(part, offset + done, out + done, piece) != ESP_OK)
        {
            return false;
        }
    }
    return true;
}
#endif

class ReaderCrashUploadPorts : public crashupload::Ports
{
public:
    ReaderCrashUploadPorts(std::function<bool(const char *, size_t)> send, std::function<bool()> otaInProgress)
        : sendMessage(std::move(send)), otaRunning(std::move(otaInProgress))
    {
    }

    bool loadPending(PendingCrashBootRecord &out) override
    {
        PendingCrashBootRecord blob = {};
        KVStore prefs;
        prefs.begin(BOOT_DIAG_NAMESPACE, true);
        const size_t length = prefs.getBytes(BOOT_DIAG_PENDING_KEY, &blob, sizeof(blob));
        const uint8_t legacyReason = prefs.getUChar(BOOT_DIAG_PENDING_REASON_KEY, 0);
        prefs.end();
        if (length == 0)
        {
            return false;
        }

        switch (crashupload::decodePendingBlob(&blob, length, out))
        {
        case crashupload::PendingBlobKind::V2:
            return true;
        case crashupload::PendingBlobKind::RecordOnly:
            // Records before version 1 stored the reset reason separately. An intentional
            // software reset is not crash telemetry, so discard such an old pair.
            if (legacyReason == ESP_RST_SW || (legacyReason == 0 && esp_reset_reason() == ESP_RST_SW))
            {
                clearPending();
                return false;
            }
            out.resetReason = legacyReason != 0 ? legacyReason : (uint8_t)esp_reset_reason();
            break;
        case crashupload::PendingBlobKind::V1:
            break;
        case crashupload::PendingBlobKind::Invalid:
            return false;
        }

        // Written by firmware before ATT-1144, which tied no dump to the record. A crash keeps the
        // dump it would have uploaded; the conversion is stored so it happens only once.
        out.dump = crashClaimFlashDump(crashResetIsCrash(out.resetReason));
        savePending(out);
        return true;
    }

    void savePending(const PendingCrashBootRecord &record) override
    {
        KVStore prefs;
        prefs.begin(BOOT_DIAG_NAMESPACE, false);
        prefs.putBytes(BOOT_DIAG_PENDING_KEY, &record, sizeof(record));
        prefs.remove(BOOT_DIAG_PENDING_REASON_KEY);
        prefs.end();
    }

    void clearPending() override
    {
        KVStore prefs;
        prefs.begin(BOOT_DIAG_NAMESPACE, false);
        prefs.remove(BOOT_DIAG_PENDING_KEY);
        prefs.remove(BOOT_DIAG_PENDING_REASON_KEY);
        prefs.remove(BOOT_DIAG_REBOOT_REASON_KEY);
        prefs.end();
    }

    std::string rebootReason() override
    {
        KVStore prefs;
        prefs.begin(BOOT_DIAG_NAMESPACE, true);
        std::string reason = prefs.getString(BOOT_DIAG_REBOOT_REASON_KEY);
        prefs.end();
        return reason;
    }

    CrashDumpFingerprint claimedDump() override { return readFingerprint(BOOT_DIAG_DUMP_CLAIMED_KEY); }
    void setClaimedDump(const CrashDumpFingerprint &fingerprint) override
    {
        writeFingerprint(BOOT_DIAG_DUMP_CLAIMED_KEY, fingerprint);
    }
    CrashDumpFingerprint doneDump() override { return readFingerprint(BOOT_DIAG_DUMP_DONE_KEY); }
    void setDoneDump(const CrashDumpFingerprint &fingerprint) override
    {
        writeFingerprint(BOOT_DIAG_DUMP_DONE_KEY, fingerprint);
    }

    CrashDumpFingerprint flashDump() override { return crashFlashDumpFingerprint(); }

    bool readDump(uint32_t offset, uint8_t *out, size_t length) override
    {
#if CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH
        const esp_partition_t *part = coredumpPartition();
        return part && readCoredumpPartition(part, offset, out, length);
#else
        (void)offset;
        (void)out;
        (void)length;
        return false;
#endif
    }

    bool eraseDump() override
    {
#if CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH
        cachedFlashDumpKnown = true;
        cachedFlashDump = {};
        return esp_core_dump_image_erase() == ESP_OK;
#else
        return false;
#endif
    }

    bool heapAvailable(size_t rawBytes, size_t messageBytes) override
    {
        // Chunk buffers are below the PSRAM malloc threshold, so they and every copy of the message
        // land in internal RAM. Sending a message on the secure session copies it about 2.4 times
        // more (session frame, TLS records in the outbox, websocket TX queue), so the budget counts
        // the message 3 times, the raw chunk once, and keeps headroom for TLS and LVGL. For a 4 KiB
        // chunk (~5.6 KB message) that is ~44 KiB free internal RAM; the HIL upload saw at least 83 KB.
        // The largest block check uses internal RAM only: with PSRAM in MALLOC_CAP_DEFAULT it always passed.
        return heap_caps_get_free_size(MALLOC_CAP_INTERNAL) >=
                   CRASH_UPLOAD_MESSAGE_COPIES * messageBytes + rawBytes + CRASH_UPLOAD_INTERNAL_HEADROOM_BYTES &&
               heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) >= std::max(rawBytes, messageBytes);
    }

    bool otaInProgress() override { return otaRunning(); }
    bool send(const char *json, size_t length) override { return sendMessage(json, length); }
    const char *resetReasonName(uint8_t reason) override { return crashResetReasonToString(reason); }

private:
    static constexpr size_t CRASH_UPLOAD_INTERNAL_HEADROOM_BYTES = 24 * 1024;
    static constexpr size_t CRASH_UPLOAD_MESSAGE_COPIES = 3;
    std::function<bool(const char *, size_t)> sendMessage;
    std::function<bool()> otaRunning;
};
} // namespace

CrashDumpFingerprint crashFlashDumpFingerprint()
{
#if CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH
    if (cachedFlashDumpKnown)
    {
        return cachedFlashDump;
    }
    cachedFlashDumpKnown = true;
    size_t address = 0;
    size_t size = 0;
    const esp_partition_t *part = coredumpPartition();
    if (!part || esp_core_dump_image_check() != ESP_OK || esp_core_dump_image_get(&address, &size) != ESP_OK ||
        size == 0 || size > part->size || size > CRASH_COREDUMP_PARTITION_BYTES)
    {
        return cachedFlashDump;
    }
    uint8_t buffer[COREDUMP_READ_PIECE_BYTES];
    uint32_t crc = 0;
    for (size_t offset = 0; offset < size; offset += sizeof(buffer))
    {
        const size_t length = size - offset < sizeof(buffer) ? size - offset : sizeof(buffer);
        if (!readCoredumpPartition(part, offset, buffer, length))
        {
            return cachedFlashDump;
        }
        // The ROM CRC-32 inverts in and out, so chaining it gives the zlib CRC-32 the server checks.
        crc = esp_rom_crc32_le(crc, buffer, static_cast<uint32_t>(length));
    }
    cachedFlashDump = {static_cast<uint32_t>(size), crc};
#endif
    return cachedFlashDump;
}

CrashDumpFingerprint crashClaimFlashDump(bool crashReset)
{
    const CrashDumpFingerprint dump = crashFlashDumpFingerprint();
    if (!crashupload::shouldAttachDump(crashReset, dump, readFingerprint(BOOT_DIAG_DUMP_CLAIMED_KEY),
                                       readFingerprint(BOOT_DIAG_DUMP_DONE_KEY)))
    {
        return {};
    }
    writeFingerprint(BOOT_DIAG_DUMP_CLAIMED_KEY, dump);
    return dump;
}

std::unique_ptr<crashupload::Ports> makeCrashUploadPorts(std::function<bool(const char *, size_t)> send,
                                                         std::function<bool()> otaInProgress)
{
    return std::unique_ptr<crashupload::Ports>(new ReaderCrashUploadPorts(std::move(send), std::move(otaInProgress)));
}
#else
namespace
{
// The desktop simulator never crashes into a coredump: nothing is ever pending.
class NoCrashUploadPorts : public crashupload::Ports
{
public:
    bool loadPending(PendingCrashBootRecord &) override { return false; }
    void savePending(const PendingCrashBootRecord &) override {}
    void clearPending() override {}
    std::string rebootReason() override { return {}; }
    CrashDumpFingerprint claimedDump() override { return {}; }
    void setClaimedDump(const CrashDumpFingerprint &) override {}
    CrashDumpFingerprint doneDump() override { return {}; }
    void setDoneDump(const CrashDumpFingerprint &) override {}
    CrashDumpFingerprint flashDump() override { return {}; }
    bool readDump(uint32_t, uint8_t *, size_t) override { return false; }
    bool eraseDump() override { return false; }
    bool heapAvailable(size_t, size_t) override { return false; }
    bool otaInProgress() override { return false; }
    bool send(const char *, size_t) override { return false; }
    const char *resetReasonName(uint8_t) override { return "UNKNOWN"; }
};
} // namespace

std::unique_ptr<crashupload::Ports> makeCrashUploadPorts(std::function<bool(const char *, size_t)>,
                                                         std::function<bool()>)
{
    return std::unique_ptr<crashupload::Ports>(new NoCrashUploadPorts());
}
#endif
