#pragma once
// Crash report and chunked coredump upload (ATT-1144). Platform independent so host tests can drive
// it; crash-report.cpp supplies the NVS, flash and heap ports on the reader.
//
// Protocol (JSON text events, one message in flight):
//   READER_CRASH_REPORT      -> metadata + coredumpSize/coredumpCrc32; reply {received,id,coredumpUpload}
//   READER_COREDUMP_BEGIN    -> {reportId,size,crc32}; reply {reportId,chunkSize,nextOffset}
//   READER_COREDUMP_CHUNK    -> {reportId,offset,data(base64)}; reply {reportId,nextOffset}
//   READER_COREDUMP_COMPLETE -> {reportId,totalSize,crc32}; reply {reportId,coredumpStored:true}
// The pending record and the dump stay until the server confirms the stored dump.

#include <ArduinoJson.h>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <string>
#include "crash-record.hpp"
#include "../../logger/logger.hpp"

namespace crashupload
{
// Raw bytes per chunk: ~5.5 KB as a JSON message, far below the 64 KiB session frame limit.
constexpr size_t CHUNK_MAX_BYTES = 4096;
constexpr uint32_t ACK_TIMEOUT_MS = 20000;
// Symbolication runs before the server confirms the stored dump.
constexpr uint32_t COMPLETE_TIMEOUT_MS = 120000;
constexpr uint32_t HEAP_RETRY_MIN_MS = 2000;
constexpr uint32_t HEAP_RETRY_MAX_MS = 30000;
constexpr uint32_t BUSY_RETRY_MS = 5000;
constexpr uint32_t ERROR_RETRY_MS = 10000;
// After this many failed attempts in a row the upload pauses for LONG_RETRY_MS, then starts over.
constexpr uint8_t FAILURES_BEFORE_LONG_RETRY = 3;
constexpr uint32_t LONG_RETRY_MS = 5 * 60 * 1000;
constexpr const char *ORPHAN_REBOOT_REASON = "COREDUMP_ORPHAN";

constexpr size_t base64Length(size_t rawLength) { return 4 * ((rawLength + 2) / 3); }
// mbedTLS base64: writes base64Length(length) characters and a terminator, so outCapacity must be at
// least base64Length(length) + 1. Returns the character count, 0 if out is too small.
size_t base64Encode(const uint8_t *data, size_t length, char *out, size_t outCapacity);

enum class PendingBlobKind
{
    Invalid,
    RecordOnly, // pre-version-1 firmware: just the CrashBootRecord, reset reason in its own key
    V1,
    V2,
};
// Reads a BOOT_DIAG_PENDING_KEY blob. V1 and RecordOnly come back as version 2 without a dump.
PendingBlobKind decodePendingBlob(const void *blob, size_t length, PendingCrashBootRecord &out);

// A dump in flash belongs to a new crash record only when the reset was a crash, the dump is
// valid, and it is not a dump that an earlier record or upload already claimed or finished.
bool shouldAttachDump(bool crashReset, const CrashDumpFingerprint &flashDump, const CrashDumpFingerprint &claimed,
                      const CrashDumpFingerprint &done);
// A new crash or hang record replaces the pending one, except when the pending record still owns the
// dump in flash, has not reported its metadata yet and is no orphan, and the new record brings no dump
// of its own: the new reset is then only logged, so the crash keeps its details and its dump.
bool keepPendingRecord(const PendingCrashBootRecord *existing, const CrashDumpFingerprint &flashDump,
                       bool newRecordClaimsDump);
// A valid dump that the pending record does not own and that is not finished yet.
bool isOrphanDump(const CrashDumpFingerprint &flashDump, const PendingCrashBootRecord *pending,
                  const CrashDumpFingerprint &done);

class Ports
{
public:
    virtual ~Ports() = default;
    virtual bool loadPending(PendingCrashBootRecord &out) = 0; // false: no pending record
    virtual void savePending(const PendingCrashBootRecord &record) = 0;
    virtual void clearPending() = 0; // also drops the legacy reason and the reboot reason
    virtual std::string rebootReason() = 0;
    virtual CrashDumpFingerprint claimedDump() = 0;
    virtual void setClaimedDump(const CrashDumpFingerprint &fingerprint) = 0;
    virtual CrashDumpFingerprint doneDump() = 0;
    virtual void setDoneDump(const CrashDumpFingerprint &fingerprint) = 0;
    virtual CrashDumpFingerprint flashDump() = 0; // the valid dump in flash; size 0 = none
    virtual bool readDump(uint32_t offset, uint8_t *out, size_t length) = 0;
    virtual bool eraseDump() = 0;
    // Room for one chunk upload: the raw chunk and its JSON message, plus what sending the message costs.
    virtual bool heapAvailable(size_t rawBytes, size_t messageBytes) = 0;
    virtual bool otaInProgress() = 0;
    // Queues the message; must never deliver a reply synchronously (Uploader::onResponse is not reentrant).
    virtual bool send(const char *json, size_t length) = 0;
    virtual const char *resetReasonName(uint8_t reason) = 0; // esp_reset_reason_t as text
};

// The public calls may come from different tasks (the replies arrive on the
// websocket task, tick runs on the main loop); a mutex serializes them.
class Uploader
{
public:
    Uploader(Ports &ports, Logger &logger) : ports(ports), logger(logger) {}

    // The reader signed in: start (or restart) from the persisted state.
    void onAuthenticated(uint32_t nowMs);
    // The connection is gone: drop what is in flight; the persisted state stays.
    void onDisconnected();
    void tick(uint32_t nowMs);
    // Server reply to one of the crash report events. Returns false for an unexpected type.
    bool onResponse(const char *eventType, JsonObjectConst payload, uint32_t nowMs);

    enum class Step : uint8_t
    {
        Idle,          // not connected, or nothing left to do on this connection
        Start,         // look at the persisted state and send the next message
        AwaitMetadata, // READER_CRASH_REPORT sent
        AwaitBegin,
        SendChunk,
        AwaitChunk,
        AwaitComplete,
    };
    Step step() const { return currentStep; }
    uint32_t offset() const { return currentOffset; }

private:
    Ports &ports;
    Logger &logger;
    std::mutex mutex;
    Step currentStep = Step::Idle;
    PendingCrashBootRecord pending{};
    uint32_t currentOffset = 0;
    size_t chunkSize = CHUNK_MAX_BYTES;
    uint32_t notBeforeMs = 0;
    uint32_t sentAtMs = 0;
    uint32_t heapRetryMs = HEAP_RETRY_MIN_MS;
    uint8_t failures = 0;
    uint8_t lastProgressQuarter = 0;

    void start(uint32_t nowMs);
    void sendMetadata(uint32_t nowMs);
    void sendBegin(uint32_t nowMs);
    void sendChunk(uint32_t nowMs);
    void sendComplete(uint32_t nowMs);
    bool sendEvent(const char *type, JsonDocument &payload);
    void await(Step next, uint32_t nowMs);
    void retryLater(uint32_t nowMs, uint32_t delayMs);
    void fail(uint32_t nowMs, const char *what);
    void finishRecord(uint32_t nowMs);
    void onStored(uint32_t nowMs);
    void giveUpDump(uint32_t nowMs, const char *why);
    void dropRecord(uint32_t nowMs, const char *why);

    void onMetadataAck(JsonObjectConst payload, uint32_t nowMs);
    void onBeginAck(JsonObjectConst payload, uint32_t nowMs);
    void onChunkAck(JsonObjectConst payload, uint32_t nowMs);
    void onCompleteAck(JsonObjectConst payload, uint32_t nowMs);
    bool forThisReport(JsonObjectConst payload) const;
    bool hasDump() const { return pending.dump.present(); }
    bool isOrphan() const { return (pending.flags & CRASH_PENDING_FLAG_ORPHAN) != 0; }
};
} // namespace crashupload
