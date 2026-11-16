// Crash report and chunked coredump upload state machine (ATT-1144)
// FEATURE: api-diag

#include "coredump-upload.hpp"
#include <algorithm>
#include <cstdio>
#include <cstring>
#include <memory>
#include <new>
#include "mbedtls/base64.h"

namespace crashupload
{
size_t base64Encode(const uint8_t *data, size_t length, char *out, size_t outCapacity)
{
    size_t written = 0;
    if (mbedtls_base64_encode(reinterpret_cast<unsigned char *>(out), outCapacity, &written, data, length) != 0)
    {
        return 0;
    }
    return written;
}

PendingBlobKind decodePendingBlob(const void *blob, size_t length, PendingCrashBootRecord &out)
{
    out = {};
    if (length == sizeof(PendingCrashBootRecord))
    {
        memcpy(&out, blob, sizeof(out));
        if (out.version != BOOT_DIAG_PENDING_VERSION || out.record.magic != BOOT_DIAG_MAGIC ||
            out.phase > static_cast<uint8_t>(CrashUploadPhase::DumpPending) ||
            (out.phase == static_cast<uint8_t>(CrashUploadPhase::DumpPending) &&
             (out.reportId == 0 || !out.dump.present())))
        {
            out = {};
            return PendingBlobKind::Invalid;
        }
        out.firmwareVersion[CRASH_FIRMWARE_VERSION_BYTES - 1] = '\0';
        return PendingBlobKind::V2;
    }

    if (length == sizeof(PendingCrashBootRecordV1))
    {
        PendingCrashBootRecordV1 v1;
        memcpy(&v1, blob, sizeof(v1));
        if (v1.version != BOOT_DIAG_PENDING_VERSION_1 || v1.record.magic != BOOT_DIAG_MAGIC)
        {
            return PendingBlobKind::Invalid;
        }
        out.record = v1.record;
        out.resetReason = v1.resetReason;
        out.version = BOOT_DIAG_PENDING_VERSION;
        return PendingBlobKind::V1;
    }

    if (length == sizeof(CrashBootRecord))
    {
        memcpy(&out.record, blob, sizeof(out.record));
        if (out.record.magic != BOOT_DIAG_MAGIC)
        {
            out = {};
            return PendingBlobKind::Invalid;
        }
        out.version = BOOT_DIAG_PENDING_VERSION;
        return PendingBlobKind::RecordOnly;
    }
    return PendingBlobKind::Invalid;
}

bool shouldAttachDump(bool crashReset, const CrashDumpFingerprint &flashDump, const CrashDumpFingerprint &claimed,
                      const CrashDumpFingerprint &done)
{
    return crashReset && flashDump.present() && flashDump.size <= CRASH_COREDUMP_PARTITION_BYTES &&
           flashDump != claimed && flashDump != done;
}

bool keepPendingRecord(const PendingCrashBootRecord *existing, const CrashDumpFingerprint &flashDump,
                       bool newRecordClaimsDump)
{
    // An awaited report gets its dump back as an orphan (matched by fingerprint); an orphan has no details.
    return existing != nullptr && !newRecordClaimsDump && existing->dump.present() && existing->dump == flashDump &&
           existing->phase == static_cast<uint8_t>(CrashUploadPhase::MetadataPending) &&
           (existing->flags & CRASH_PENDING_FLAG_ORPHAN) == 0;
}

/** BEGIN errors that say this report will never take this dump; anything else is worth a retry. */
static bool reportRefusesDump(const char *error)
{
    static constexpr const char *permanent[] = {"COREDUMP_REPORT_NOT_FOUND", "COREDUMP_MISMATCH",
                                                "COREDUMP_ALREADY_STORED", "COREDUMP_NOT_EXPECTED",
                                                "INVALID_COREDUMP"};
    for (const char *candidate : permanent)
    {
        if (strcmp(error, candidate) == 0) return true;
    }
    return false;
}

bool isOrphanDump(const CrashDumpFingerprint &flashDump, const PendingCrashBootRecord *pending,
                  const CrashDumpFingerprint &done)
{
    if (!flashDump.present() || flashDump.size > CRASH_COREDUMP_PARTITION_BYTES || flashDump == done)
    {
        return false;
    }
    return pending == nullptr || pending->dump != flashDump;
}

void Uploader::onAuthenticated(uint32_t nowMs)
{
    std::lock_guard<std::mutex> lock(mutex);
    currentStep = Step::Start;
    notBeforeMs = nowMs;
    failures = 0;
    heapRetryMs = HEAP_RETRY_MIN_MS;
}

void Uploader::onDisconnected()
{
    std::lock_guard<std::mutex> lock(mutex);
    if (currentStep != Step::Idle && currentStep != Step::Start)
    {
        logger.info("Crash report upload interrupted by the disconnect; it resumes after the next sign-in");
    }
    currentStep = Step::Idle;
}

void Uploader::tick(uint32_t nowMs)
{
    std::lock_guard<std::mutex> lock(mutex);
    switch (currentStep)
    {
    case Step::Idle:
        return;
    case Step::AwaitMetadata:
    case Step::AwaitBegin:
    case Step::AwaitChunk:
    case Step::AwaitComplete:
    {
        const uint32_t timeout = currentStep == Step::AwaitComplete ? COMPLETE_TIMEOUT_MS : ACK_TIMEOUT_MS;
        if (nowMs - sentAtMs >= timeout)
        {
            fail(nowMs, "no reply from the server");
        }
        return;
    }
    default:
        break;
    }

    if (static_cast<int32_t>(nowMs - notBeforeMs) < 0)
    {
        return;
    }
    if (ports.otaInProgress())
    {
        // A firmware update owns the connection; resume when it is over.
        notBeforeMs = nowMs + BUSY_RETRY_MS;
        return;
    }
    if (currentStep == Step::Start)
    {
        start(nowMs);
    }
    else if (currentStep == Step::SendChunk)
    {
        sendChunk(nowMs);
    }
}

bool Uploader::onResponse(const char *eventType, JsonObjectConst payload, uint32_t nowMs)
{
    std::lock_guard<std::mutex> lock(mutex);
    // Replies that do not match the step (late, or for an attempt given up already) are ignored.
    if (strcmp(eventType, "READER_CRASH_REPORT") == 0)
    {
        if (currentStep == Step::AwaitMetadata) onMetadataAck(payload, nowMs);
        return true;
    }
    if (strcmp(eventType, "READER_COREDUMP_BEGIN") == 0)
    {
        if (currentStep == Step::AwaitBegin && forThisReport(payload)) onBeginAck(payload, nowMs);
        return true;
    }
    if (strcmp(eventType, "READER_COREDUMP_CHUNK") == 0)
    {
        if (currentStep == Step::AwaitChunk && forThisReport(payload)) onChunkAck(payload, nowMs);
        return true;
    }
    if (strcmp(eventType, "READER_COREDUMP_COMPLETE") == 0)
    {
        if (currentStep == Step::AwaitComplete && forThisReport(payload)) onCompleteAck(payload, nowMs);
        return true;
    }
    return false;
}

bool Uploader::forThisReport(JsonObjectConst payload) const
{
    // Errors about a malformed request may not name the report.
    return payload["reportId"].isNull() || (payload["reportId"] | 0u) == pending.reportId;
}

void Uploader::start(uint32_t nowMs)
{
    const CrashDumpFingerprint flash = ports.flashDump();
    if (!ports.loadPending(pending))
    {
        pending = {};
        if (!isOrphanDump(flash, nullptr, ports.doneDump()))
        {
            currentStep = Step::Idle;
            return;
        }
        // A dump without its boot record (e.g. left in flash by firmware before ATT-1144): it gets a
        // report of its own. The crash firmware is unknown; the server reads the build id from the dump.
        pending.record.magic = BOOT_DIAG_MAGIC;
        pending.version = BOOT_DIAG_PENDING_VERSION;
        pending.flags = CRASH_PENDING_FLAG_ORPHAN;
        pending.dump = flash;
        ports.setClaimedDump(flash);
        ports.savePending(pending);
        logger.infof("Found a coredump without a crash record (%u bytes); reporting it on its own",
                     static_cast<unsigned>(flash.size));
    }

    if (hasDump() && flash != pending.dump)
    {
        // Erased or overwritten by a later crash: only the metadata is left to report.
        logger.error("The coredump of the pending crash report is no longer in flash");
        if (pending.phase == static_cast<uint8_t>(CrashUploadPhase::DumpPending) || isOrphan())
        {
            dropRecord(nowMs, "its coredump is gone");
            return;
        }
        pending.dump = {};
        ports.savePending(pending);
    }

    if (pending.phase == static_cast<uint8_t>(CrashUploadPhase::DumpPending))
    {
        sendBegin(nowMs);
    }
    else
    {
        sendMetadata(nowMs);
    }
}

bool Uploader::sendEvent(const char *type, JsonDocument &payload)
{
    JsonDocument event;
    event["event"] = "EVENT";
    event["data"]["type"] = type;
    event["data"]["payload"] = payload;
    char json[512];
    const size_t length = serializeJson(event, json, sizeof(json));
    if (length == 0 || length >= sizeof(json))
    {
        logger.errorf("Failed to serialize %s", type);
        return false;
    }
    return ports.send(json, length);
}

void Uploader::sendMetadata(uint32_t nowMs)
{
    JsonDocument payload;
    payload["resetReason"] = ports.resetReasonName(pending.resetReason);
    if (isOrphan())
    {
        payload["rebootReason"] = ORPHAN_REBOOT_REASON;
    }
    else
    {
        payload["heapFreeBytes"] = pending.record.freeInternalHeap;
        payload["largestFreeBlockBytes"] = pending.record.largestFreeBlock;
        payload["uptimeBeforeResetMs"] = pending.record.uptimeMs;
        payload["wsState"] = pending.record.websocketConnected ? "CONNECTED" : "DISCONNECTED";
        payload["wifiState"] = pending.record.wifiConnected ? "CONNECTED" : "DISCONNECTED";
        // Optional deliberate-reboot reason left behind before the firmware rebooted itself.
        // Truncated so an odd value can never make the report too large to send.
        const std::string rebootReason = ports.rebootReason().substr(0, 64);
        if (!rebootReason.empty()) payload["rebootReason"] = rebootReason;
    }
    if (pending.firmwareVersion[0] != '\0')
    {
        payload["firmwareVersion"] = pending.firmwareVersion;
    }
    else
    {
        payload["firmwareVersion"] = nullptr;
    }
    if (hasDump())
    {
        payload["coredumpSize"] = pending.dump.size;
        payload["coredumpCrc32"] = pending.dump.crc32;
    }

    logger.infof("Uploading crash report: reset=%s orphan=%d uptime=%ums coredump=%u bytes",
                 ports.resetReasonName(pending.resetReason), isOrphan() ? 1 : 0,
                 static_cast<unsigned>(pending.record.uptimeMs), static_cast<unsigned>(pending.dump.size));
    // The step is set first, so it never lags behind the message (fail() replaces it if sending fails).
    await(Step::AwaitMetadata, nowMs);
    if (!sendEvent("READER_CRASH_REPORT", payload))
    {
        fail(nowMs, "the crash report could not be sent");
    }
}

void Uploader::sendBegin(uint32_t nowMs)
{
    JsonDocument payload;
    payload["reportId"] = pending.reportId;
    payload["size"] = pending.dump.size;
    payload["crc32"] = pending.dump.crc32;
    currentOffset = 0;
    lastProgressQuarter = 0;
    await(Step::AwaitBegin, nowMs);
    if (!sendEvent("READER_COREDUMP_BEGIN", payload))
    {
        fail(nowMs, "the coredump upload could not be started");
    }
}

void Uploader::sendChunk(uint32_t nowMs)
{
    if (currentOffset >= pending.dump.size)
    {
        sendComplete(nowMs);
        return;
    }
    const size_t length = std::min<size_t>(chunkSize, pending.dump.size - currentOffset);
    char head[160];
    const int headLength = snprintf(head, sizeof(head),
                                    "{\"event\":\"EVENT\",\"data\":{\"type\":\"READER_COREDUMP_CHUNK\",\"payload\":{"
                                    "\"reportId\":%u,\"offset\":%u,\"data\":\"",
                                    static_cast<unsigned>(pending.reportId), static_cast<unsigned>(currentOffset));
    static const char tail[] = "\"}}}";
    const size_t messageLength = static_cast<size_t>(headLength) + base64Length(length) + sizeof(tail) - 1;

    // One raw chunk and one message at a time: memory use depends on the chunk, never on the dump.
    std::unique_ptr<uint8_t[]> raw;
    std::unique_ptr<char[]> message;
    if (ports.heapAvailable(length, messageLength))
    {
        raw.reset(new (std::nothrow) uint8_t[length]);
        message.reset(new (std::nothrow) char[messageLength]);
    }
    if (!raw || !message)
    {
        if (heapRetryMs == HEAP_RETRY_MIN_MS)
        {
            logger.infof("Deferring the coredump upload at offset %u: not enough free heap",
                         static_cast<unsigned>(currentOffset));
        }
        notBeforeMs = nowMs + heapRetryMs;
        heapRetryMs = std::min(heapRetryMs * 2, HEAP_RETRY_MAX_MS);
        return;
    }
    heapRetryMs = HEAP_RETRY_MIN_MS;

    if (!ports.readDump(currentOffset, raw.get(), length))
    {
        fail(nowMs, "the coredump could not be read from flash");
        return;
    }
    memcpy(message.get(), head, static_cast<size_t>(headLength));
    // The encoder's terminator lands where the tail goes and is overwritten by it.
    base64Encode(raw.get(), length, message.get() + headLength, base64Length(length) + sizeof(tail) - 1);
    memcpy(message.get() + headLength + base64Length(length), tail, sizeof(tail) - 1);
    raw.reset();
    await(Step::AwaitChunk, nowMs);
    if (!ports.send(message.get(), messageLength))
    {
        fail(nowMs, "a coredump chunk could not be sent");
    }
}

void Uploader::sendComplete(uint32_t nowMs)
{
    JsonDocument payload;
    payload["reportId"] = pending.reportId;
    payload["totalSize"] = pending.dump.size;
    payload["crc32"] = pending.dump.crc32;
    await(Step::AwaitComplete, nowMs);
    if (!sendEvent("READER_COREDUMP_COMPLETE", payload))
    {
        fail(nowMs, "the coredump upload could not be completed");
    }
}

void Uploader::await(Step next, uint32_t nowMs)
{
    currentStep = next;
    sentAtMs = nowMs;
}

void Uploader::retryLater(uint32_t nowMs, uint32_t delayMs)
{
    currentStep = Step::Start;
    notBeforeMs = nowMs + delayMs;
}

void Uploader::fail(uint32_t nowMs, const char *what)
{
    if (++failures >= FAILURES_BEFORE_LONG_RETRY)
    {
        // A paired reader may stay signed in for days: pause instead of waiting for the next sign-in.
        logger.errorf("Crash report upload failed %u times (%s); trying again in %u minutes",
                      static_cast<unsigned>(failures), what, static_cast<unsigned>(LONG_RETRY_MS / 60000));
        failures = 0;
        retryLater(nowMs, LONG_RETRY_MS);
        return;
    }
    logger.errorf("Crash report upload failed (%s); retrying", what);
    retryLater(nowMs, ERROR_RETRY_MS);
}

void Uploader::finishRecord(uint32_t nowMs)
{
    ports.clearPending();
    pending = {};
    currentOffset = 0;
    failures = 0;
    // Look again: a dump that this record did not own may still need a report.
    currentStep = Step::Start;
    notBeforeMs = nowMs;
}

void Uploader::onStored(uint32_t nowMs)
{
    logger.infof("Coredump of crash report %u stored on the server; erasing it", static_cast<unsigned>(pending.reportId));
    ports.setDoneDump(pending.dump);
    if (!ports.eraseDump())
    {
        logger.error("Erasing the uploaded coredump failed; it will not be uploaded again");
    }
    finishRecord(nowMs);
}

void Uploader::giveUpDump(uint32_t nowMs, const char *why)
{
    // Kept in flash for a bench readout over USB, but never offered again.
    logger.errorf("The server will not take the %u byte coredump (%s); keeping it in flash",
                  static_cast<unsigned>(pending.dump.size), why);
    ports.setDoneDump(pending.dump);
    finishRecord(nowMs);
}

void Uploader::dropRecord(uint32_t nowMs, const char *why)
{
    logger.errorf("Dropping crash report %u: %s", static_cast<unsigned>(pending.reportId), why);
    if (isOrphan() && hasDump())
    {
        // An orphan that failed for good is not retried as another orphan.
        ports.setDoneDump(pending.dump);
    }
    finishRecord(nowMs);
}

void Uploader::onMetadataAck(JsonObjectConst payload, uint32_t nowMs)
{
    if (!(payload["received"] | false))
    {
        // e.g. CRASH_REPORT_STORE_FAILED: a database hiccup on the server. The record stays and is retried.
        fail(nowMs, payload["error"] | "crash report rejected by the server");
        return;
    }
    const uint32_t reportId = payload["id"] | 0u;
    if (!hasDump())
    {
        logger.info("Crash report accepted; clearing the stored record");
        finishRecord(nowMs);
        return;
    }
    const char *rejected = payload["coredumpRejected"] | static_cast<const char *>(nullptr);
    if (rejected)
    {
        giveUpDump(nowMs, rejected);
        return;
    }
    JsonObjectConst upload = payload["coredumpUpload"];
    if (upload.isNull() || reportId == 0)
    {
        // Neither an upload nor a refusal (an odd or stale reply): only an explicit refusal gives the dump up.
        fail(nowMs, "the crash report reply offers no coredump upload");
        return;
    }
    pending.reportId = reportId;
    pending.phase = static_cast<uint8_t>(CrashUploadPhase::DumpPending);
    ports.savePending(pending);
    logger.infof("Crash report %u accepted; its coredump is uploaded next", static_cast<unsigned>(reportId));
    sendBegin(nowMs);
}

void Uploader::onBeginAck(JsonObjectConst payload, uint32_t nowMs)
{
    const char *error = payload["error"] | static_cast<const char *>(nullptr);
    if (payload["coredumpStored"] | false)
    {
        onStored(nowMs); // stored before an earlier confirmation got lost
        return;
    }
    if (error)
    {
        if (strcmp(error, "COREDUMP_BUSY") == 0)
        {
            retryLater(nowMs, BUSY_RETRY_MS);
        }
        else if (strcmp(error, "COREDUMP_TOO_LARGE") == 0)
        {
            giveUpDump(nowMs, error);
        }
        else if (reportRefusesDump(error))
        {
            // The report is gone or does not expect this dump: report the dump on its own instead.
            dropRecord(nowMs, error);
        }
        else
        {
            fail(nowMs, error); // e.g. CRASH_REPORT_STORE_FAILED: the server could not look the report up
        }
        return;
    }
    const uint32_t serverChunk = payload["chunkSize"] | 0u;
    const uint32_t nextOffset = payload["nextOffset"] | 0u;
    if (serverChunk == 0 || nextOffset > pending.dump.size)
    {
        fail(nowMs, "invalid upload offer");
        return;
    }
    chunkSize = std::min<size_t>(serverChunk, CHUNK_MAX_BYTES);
    currentOffset = nextOffset;
    logger.infof("Uploading the %u byte coredump of crash report %u in %u byte chunks",
                 static_cast<unsigned>(pending.dump.size), static_cast<unsigned>(pending.reportId),
                 static_cast<unsigned>(chunkSize));
    currentStep = Step::SendChunk;
    notBeforeMs = nowMs;
}

void Uploader::onChunkAck(JsonObjectConst payload, uint32_t nowMs)
{
    const char *error = payload["error"] | static_cast<const char *>(nullptr);
    if (error)
    {
        const uint32_t expected = payload["expectedOffset"] | UINT32_MAX;
        if (strcmp(error, "COREDUMP_OUT_OF_ORDER") == 0 && expected == currentOffset)
        {
            // Refused, yet the server wants this very chunk: resending it would loop without progress.
            fail(nowMs, "the server refuses the chunk it asks for");
        }
        else if (strcmp(error, "COREDUMP_OUT_OF_ORDER") == 0 && expected <= pending.dump.size)
        {
            logger.infof("Coredump upload resyncs at offset %u", static_cast<unsigned>(expected));
            currentOffset = expected;
            currentStep = Step::SendChunk;
            notBeforeMs = nowMs;
        }
        else
        {
            fail(nowMs, error); // e.g. COREDUMP_NO_UPLOAD after a server timeout: start it again
        }
        return;
    }
    const uint32_t nextOffset = payload["nextOffset"] | UINT32_MAX;
    if (nextOffset > pending.dump.size)
    {
        fail(nowMs, "invalid chunk acknowledgement");
        return;
    }
    if (nextOffset <= currentOffset)
    {
        // The server did not take the chunk (every ack moves past the chunk it acknowledges).
        fail(nowMs, "a chunk acknowledgement without progress");
        return;
    }
    currentOffset = nextOffset;
    const uint8_t quarter = static_cast<uint8_t>((static_cast<uint64_t>(currentOffset) * 4) / pending.dump.size);
    if (quarter > lastProgressQuarter && quarter < 4)
    {
        lastProgressQuarter = quarter;
        logger.infof("Coredump upload %u%% (%u/%u bytes)", quarter * 25u, static_cast<unsigned>(currentOffset),
                     static_cast<unsigned>(pending.dump.size));
    }
    // The next chunk goes out on the next loop iteration, so the loop never blocks on the upload.
    currentStep = Step::SendChunk;
    notBeforeMs = nowMs;
}

void Uploader::onCompleteAck(JsonObjectConst payload, uint32_t nowMs)
{
    if (payload["coredumpStored"] | false)
    {
        onStored(nowMs);
        return;
    }
    fail(nowMs, payload["error"] | "upload not confirmed");
}
} // namespace crashupload
