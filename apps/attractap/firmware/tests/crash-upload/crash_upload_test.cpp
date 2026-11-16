// Crash report and chunked coredump upload (ATT-1144): the real state machine against a fake server that
// implements the protocol, with in-memory NVS and coredump flash.
#include "crash_upload_harness.hpp"

static void uploadsDumpOfSize(size_t size)
{
    Harness h;
    h.reader.crash(size);
    const std::vector<uint8_t> dump = h.reader.dump;
    h.connect();
    h.run();
    expectStoredAndCleared(h, dump);
    const auto &metadata = h.onlyReport().metadata;
    require(std::string(metadata["firmwareVersion"] | "") == "1.7.0", "crash firmware version not reported");
    require(std::string(metadata["resetReason"] | "") == "PANIC", "reset reason not reported");
    require((metadata["coredumpSize"] | 0u) == size, "declared size wrong");
    require(metadata["coredumpBase64"].isNull(), "dump sent inline");
    require(h.server.metadataMessages == 1, "duplicate crash report");
    require(h.server.chunkMessages == (size + CHUNK_MAX_BYTES - 1) / CHUNK_MAX_BYTES, "unexpected chunk count");
    require(h.reader.largestMessage < SESSION_FRAME_LIMIT / 8, "a message is too large");
    // Memory needed per chunk depends on the chunk size only (raw + base64 message).
    require(h.reader.largestHeapRequest <= CHUNK_MAX_BYTES + base64Length(CHUNK_MAX_BYTES) + 256,
            "heap request grows with the dump");
}

static void noDumpClearsAfterMetadata()
{
    Harness h;
    h.reader.crash(0);
    h.connect();
    h.run();
    require(h.onlyReport().metadata["coredumpSize"].isNull(), "no-dump report declares a dump");
    require(!h.reader.pending, "record kept after a metadata-only report");
    require(h.server.beginMessages == 0, "upload started without a dump");
    require(h.reader.erases == 0, "erased without a dump");
}

static void metadataAckAloneKeepsTheDump()
{
    Harness h;
    h.reader.crash(43776);
    h.server.dropNext["READER_COREDUMP_BEGIN"] = 1;
    h.connect();
    for (int i = 0; i < 5; ++i) h.step();
    require(h.reader.pending.has_value(), "record cleared after the metadata ack");
    require(h.reader.pending->phase == static_cast<uint8_t>(CrashUploadPhase::DumpPending), "phase not advanced");
    require(h.reader.pending->reportId == 100, "report id not persisted");
    require(!h.reader.dump.empty() && h.reader.erases == 0, "dump erased before it was stored");
}

static void disconnectMidUploadResumesWithoutDuplicate()
{
    Harness h;
    h.reader.crash(43776);
    const auto dump = h.reader.dump;
    h.connect();
    h.runChunks(5);
    h.disconnect();
    require(h.reader.pending && h.reader.erases == 0, "state lost on disconnect");
    for (int i = 0; i < 10; ++i) h.step(); // offline: nothing goes out
    require(h.server.chunkMessages == 5, "sent while disconnected");
    h.connect();
    h.run();
    expectStoredAndCleared(h, dump);
    require(h.server.metadataMessages == 1, "duplicate crash report after reconnect");
    require(h.server.beginMessages == 2, "upload not restarted for the same report");
}

static void rebootMidUploadResumes()
{
    Harness h;
    h.reader.crash(PARTITION);
    const auto dump = h.reader.dump;
    h.connect();
    h.runChunks(12);
    h.disconnect();
    h.reboot(); // RAM state gone, NVS and flash stay
    h.connect();
    h.run(400);
    expectStoredAndCleared(h, dump);
    require(h.server.metadataMessages == 1, "duplicate crash report after reboot");
}

static void lowHeapDefersAndContinues()
{
    Harness h;
    h.reader.crash(32 * 1024 + 1);
    const auto dump = h.reader.dump;
    h.connect();
    h.runChunks(2);
    h.reader.heapOk = false;
    const unsigned before = h.server.chunkMessages;
    for (int i = 0; i < 50; ++i) h.step(1000);
    require(h.server.chunkMessages == before, "chunk sent without heap");
    require(h.uploader->step() == Uploader::Step::SendChunk, "deferral gave up the upload");
    h.reader.heapOk = true;
    h.run(200, 1000);
    expectStoredAndCleared(h, dump);
}

static void otaBlocksTheUpload()
{
    Harness h;
    h.reader.crash(4096);
    h.reader.ota = true;
    h.connect();
    for (int i = 0; i < 20; ++i) h.step(1000);
    require(h.server.metadataMessages == 0, "uploaded during an OTA update");
    h.reader.ota = false;
    h.run(50, 1000);
    expectStoredAndCleared(h, makeDump(4096));
}

static void outOfOrderResyncs()
{
    Harness h;
    h.reader.crash(20000);
    const auto dump = h.reader.dump;
    h.connect();
    h.runChunks(2);
    // The server lost track: it asks for offset 4096 again.
    h.server.overrideNext["READER_COREDUMP_CHUNK"] =
        R"({"reportId":100,"error":"COREDUMP_OUT_OF_ORDER","expectedOffset":4096})";
    h.server.assembly->bytes.resize(4096);
    h.run();
    expectStoredAndCleared(h, dump);
}

static void lostChunkReplyTimesOutAndRetries()
{
    Harness h;
    h.reader.crash(12000);
    const auto dump = h.reader.dump;
    h.connect();
    h.runChunks(1);
    h.server.dropNext["READER_COREDUMP_CHUNK"] = 1;
    h.run(400, 1000);
    expectStoredAndCleared(h, dump);
}

static void checksumMismatchBacksOffThenRetries()
{
    Harness h;
    h.reader.crash(9000);
    const auto dump = h.reader.dump;
    h.connect();
    for (int i = 0; i < 3; ++i)
    {
        h.server.overrideNext["READER_COREDUMP_COMPLETE"] = R"({"reportId":100,"error":"COREDUMP_CHECKSUM_MISMATCH"})";
        for (int j = 0; j < 100 && !h.server.overrideNext.empty(); ++j) h.step(1000);
    }
    require(h.server.completeMessages == 3, "unexpected completion attempts");
    require(h.uploader->step() == Uploader::Step::Start, "a paused upload must resume on its own");
    require(h.reader.pending && !h.reader.dump.empty(), "gave up the dump");
    // A paired reader can stay signed in for days: the upload resumes after the pause, not at sign-in.
    const unsigned begins = h.server.beginMessages;
    for (uint32_t waited = 0; waited + 2000 < LONG_RETRY_MS; waited += 1000) h.step(1000);
    require(h.server.beginMessages == begins, "retried before the long pause was over");
    h.run(200, 1000);
    expectStoredAndCleared(h, dump);
}

static void rejectedMetadataKeepsRecord()
{
    Harness h;
    h.reader.crash(5000);
    h.server.overrideNext["READER_CRASH_REPORT"] = R"({"error":"CRASH_REPORT_STORE_FAILED"})";
    h.connect();
    h.run();
    require(h.reader.pending && h.reader.pending->phase == 0, "record dropped after a rejection");
    // A temporary server failure is retried on the same connection, after a pause.
    h.run(200, 1000);
    require(h.server.reports.size() == 1 && h.server.reports.begin()->second.stored, "retry on the connection failed");
}

static void tooLargeIsGivenUpOnce()
{
    Harness h;
    // A record whose dump is larger than the partition (never produced by ESP-IDF; the server refuses it).
    PendingCrashBootRecord record{};
    record.record.magic = BOOT_DIAG_MAGIC;
    record.version = BOOT_DIAG_PENDING_VERSION;
    record.resetReason = 4;
    record.dump = {PARTITION + 1, 0xdeadbeef};
    h.reader.pending = record;
    h.reader.dump = makeDump(PARTITION + 1);
    h.reader.pending->dump = fingerprintOf(h.reader.dump);
    h.connect();
    h.run();
    require(h.server.metadataMessages == 1, "too large dump not reported exactly once");
    require(h.server.beginMessages == 0, "upload of a refused dump started");
    require(!h.reader.pending, "record kept after the refusal");
    require(h.reader.erases == 0 && !h.reader.dump.empty(), "refused dump erased instead of kept for USB");
    require(h.reader.done == fingerprintOf(h.reader.dump), "refused dump will be offered again");
    h.connect();
    h.run();
    require(h.server.metadataMessages == 1, "refused dump reported again");
}

static void orphanDumpIsReportedOnItsOwn()
{
    Harness h;
    h.reader.dump = makeDump(43776, 9); // left by firmware 1.6.x after a metadata-only ack
    const auto dump = h.reader.dump;
    h.connect();
    h.run();
    expectStoredAndCleared(h, dump);
    const auto &metadata = h.onlyReport().metadata;
    require(std::string(metadata["rebootReason"] | "") == ORPHAN_REBOOT_REASON, "orphan marker missing");
    require(std::string(metadata["resetReason"] | "") == "UNKNOWN", "orphan reset reason");
    require(metadata["firmwareVersion"].isNull(), "orphan claims a firmware version");
    require(metadata["uptimeBeforeResetMs"].isNull(), "orphan claims a boot record");
    require(h.reader.claimed == fingerprintOf(dump), "orphan not claimed");
}

static void recordWithoutDumpThenOrphan()
{
    Harness h;
    h.reader.crash(30000, 3);
    // A silent hang record (no dump) replaces it before the upload; the dump stays in flash.
    h.reader.pending->dump = {};
    h.reader.pending->resetReason = 1;
    const auto dump = h.reader.dump;
    h.connect();
    h.run();
    require(h.server.reports.size() == 2, "expected the record and the orphan as two reports");
    require(!h.server.reports[100].stored && h.server.reports[100].metadata["coredumpSize"].isNull(),
            "stale dump attached to an unrelated record");
    require(h.server.reports[101].stored && *h.server.reports[101].stored == dump, "orphan not uploaded");
    require(!h.reader.pending && h.reader.dump.empty(), "state not cleaned up");
}

static void reportGoneFallsBackToOrphanOnce()
{
    // Each BEGIN refusal comes from server state that agrees with it, so the orphan's metadata is not
    // matched to the refused report.
    const std::vector<std::pair<std::string, std::function<void(Server &)>>> refusals = {
        {"COREDUMP_REPORT_NOT_FOUND", [](Server &server) { server.reports.erase(100); }},
        {"COREDUMP_NOT_EXPECTED", [](Server &server) { server.reports[100].expected = {}; }},
        {"COREDUMP_ALREADY_STORED",
         [](Server &server) {
             server.reports[100].expected = {3, 3};
             server.reports[100].stored = std::vector<uint8_t>{1, 2, 3};
         }},
        {"COREDUMP_MISMATCH", [](Server &server) { server.reports[100].expected.crc32 ^= 1; }},
    };
    for (const auto &[error, makeState] : refusals)
    {
        Harness h;
        h.reader.crash(10000);
        const auto dump = h.reader.dump;
        h.server.beforeNextBegin = makeState;
        h.connect();
        h.run();
        require(h.server.reports.count(101) && h.server.reports[101].stored && *h.server.reports[101].stored == dump,
                error + ": dump not recovered as an orphan");
        require(std::string(h.server.reports[101].metadata["rebootReason"] | "") == ORPHAN_REBOOT_REASON,
                error + ": recovered dump not marked as an orphan");
        require(!h.reader.pending && h.reader.dump.empty(), error + ": state not cleaned up");
    }

    // A malformed request is refused the same way every time: the record is dropped, then the orphan.
    Harness invalid;
    invalid.reader.crash(10000);
    invalid.server.overrideAlways["READER_COREDUMP_BEGIN"] = R"({"reportId":100,"error":"INVALID_COREDUMP"})";
    invalid.connect();
    invalid.run();
    require(invalid.server.reports.size() == 1, "orphan metadata created a second report for the same dump");
    require(invalid.server.beginMessages == 2, "refused upload retried in a loop");
    require(invalid.reader.done == fingerprintOf(invalid.reader.dump), "refused dump not marked done");
    require(!invalid.reader.pending && invalid.uploader->step() == Uploader::Step::Idle, "did not settle");

    Harness orphan;
    orphan.reader.dump = makeDump(10000, 4);
    orphan.server.overrideNext["READER_COREDUMP_BEGIN"] = R"({"reportId":100,"error":"COREDUMP_MISMATCH"})";
    orphan.connect();
    orphan.run();
    require(orphan.server.reports.size() == 1, "failing orphan reported again in a loop");
    require(orphan.reader.done == fingerprintOf(orphan.reader.dump), "failing orphan not marked done");
}

static void busyServerRetries()
{
    Harness h;
    h.reader.crash(5000);
    h.server.overrideNext["READER_COREDUMP_BEGIN"] = R"({"reportId":100,"error":"COREDUMP_BUSY"})";
    h.connect();
    h.run(200, 1000);
    expectStoredAndCleared(h, makeDump(5000));
}

static void transientBeginErrorRetries()
{
    // A server-side store error is temporary: neither a record nor an orphan may be given up for it.
    Harness h;
    h.reader.crash(5000);
    h.server.overrideNext["READER_COREDUMP_BEGIN"] = R"({"reportId":100,"error":"CRASH_REPORT_STORE_FAILED"})";
    h.connect();
    h.run(200, 1000);
    require(h.server.reports.size() == 1, "record dropped and its dump reported again as an orphan");
    expectStoredAndCleared(h, makeDump(5000));

    Harness orphan;
    orphan.reader.dump = makeDump(10000, 4);
    orphan.server.overrideNext["READER_COREDUMP_BEGIN"] = R"({"reportId":100,"error":"CRASH_REPORT_STORE_FAILED"})";
    orphan.connect();
    orphan.run(200, 1000);
    require(orphan.server.reports.size() == 1, "orphan reported twice after a temporary server error");
    expectStoredAndCleared(orphan, makeDump(10000, 4));
}

static void storedBeforeLostConfirmation()
{
    Harness h;
    h.reader.crash(5000);
    const auto dump = h.reader.dump;
    h.connect();
    h.server.dropNext["READER_COREDUMP_COMPLETE"] = 1;
    // The server stores it, but the confirmation is lost with the connection.
    for (int i = 0; i < 20; ++i) h.step();
    h.server.reports[100].stored = dump;
    h.disconnect();
    h.connect();
    h.run();
    expectStoredAndCleared(h, dump);
}

static void staleDumpIsNeverAttached()
{
    const auto dump = fingerprintOf(makeDump(43776));
    require(shouldAttachDump(true, dump, {}, {}), "fresh crash dump not attached");
    require(!shouldAttachDump(false, dump, {}, {}), "dump attached to a non-crash reset");
    require(!shouldAttachDump(true, dump, dump, {}), "already claimed dump attached again");
    require(!shouldAttachDump(true, dump, {}, dump), "finished dump attached again");
    require(!shouldAttachDump(true, {}, {}, {}), "missing dump attached");
    require(!shouldAttachDump(true, {PARTITION + 1, 1}, {}, {}), "oversized dump attached");

    PendingCrashBootRecord owner{};
    owner.dump = dump;
    require(!isOrphanDump(dump, &owner, {}), "owned dump treated as orphan");
    require(isOrphanDump(dump, nullptr, {}), "unowned dump not an orphan");
    require(!isOrphanDump(dump, nullptr, dump), "finished dump treated as orphan");

    // A later crash whose dump write failed leaves the claimed dump (same bytes): once the record that
    // claimed it is gone, the new record gets none.
    Harness h;
    h.reader.crash(43776);
    require(h.reader.pending->dump.present(), "first crash lost its dump");
    h.reader.pending.reset();
    h.reader.crash(43776);
    require(h.reader.pending && !h.reader.pending->dump.present(), "stale dump attached to a newer crash");
}

static void keepRecordThatOwnsTheDump()
{
    const auto dump = fingerprintOf(makeDump(43776));
    PendingCrashBootRecord owner{};
    owner.dump = dump;
    PendingCrashBootRecord dumpless{};
    require(keepPendingRecord(&owner, dump, false), "record that owns the dump replaced by a dumpless reset");
    require(!keepPendingRecord(&owner, dump, true), "record kept over a reset with a dump of its own");
    require(!keepPendingRecord(&owner, {}, false), "record kept although its dump is gone");
    require(!keepPendingRecord(&owner, fingerprintOf(makeDump(43776, 2)), false), "record kept for another dump");
    require(!keepPendingRecord(&dumpless, dump, false), "dumpless record kept");
    require(!keepPendingRecord(nullptr, dump, false), "kept a record that does not exist");
    PendingCrashBootRecord reported = owner;
    reported.phase = static_cast<uint8_t>(CrashUploadPhase::DumpPending);
    require(!keepPendingRecord(&reported, dump, false), "kept a record whose report is on the server already");
    PendingCrashBootRecord orphan = owner;
    orphan.flags = CRASH_PENDING_FLAG_ORPHAN;
    require(!keepPendingRecord(&orphan, dump, false), "an orphan record outranked a real reset");

    // Before the metadata went up: a silent hang after the crash keeps the crash and its dump.
    Harness h;
    h.reader.crash(43776);
    const auto bytes = h.reader.dump;
    h.reader.hang();
    require(h.reader.pending->resetReason == 4 && h.reader.pending->dump == dump, "crash record replaced");
    h.connect();
    h.run();
    expectStoredAndCleared(h, bytes);
    require(std::string(h.onlyReport().metadata["resetReason"] | "") == "PANIC", "hang reported instead");

    // Mid-upload: a crash that wrote no dump of its own is reported, and the dump still goes to the report
    // that awaits it (as an orphan whose fingerprint the server answers with that report).
    Harness mid;
    mid.reader.crash(43776);
    mid.connect();
    mid.runChunks(3);
    mid.disconnect();
    mid.reboot();
    mid.reader.boot(true, "1.7.1"); // crash-class reset, the dump write failed
    require(mid.reader.pending->reportId == 0 && !mid.reader.pending->dump.present(), "new reset not recorded");
    mid.connect();
    mid.run();
    require(mid.server.reports.size() == 2, "expected the first report and one for the new reset");
    const auto &awaited = mid.server.reports.at(100);
    require(awaited.stored && *awaited.stored == bytes, "dump not stored into the report that awaited it");
    require(!mid.reader.pending && mid.reader.dump.empty() && mid.reader.erases == 1, "dump or record left behind");

    // A record whose dump is gone is replaced as before.
    Harness gone;
    gone.reader.crash(43776);
    gone.reader.dump.clear();
    gone.reader.hang();
    require(gone.reader.pending->resetReason == 1, "record without its dump outranked a new reset");
}

static void dumpVanishedFromFlash()
{
    // The report already exists and only the dump was owed: the record is dropped, no BEGIN goes out.
    Harness h;
    h.reader.crash(20000);
    h.connect();
    h.runChunks(2);
    h.disconnect();
    h.reader.dump.clear(); // erased behind the uploader's back, e.g. over USB
    h.reboot();
    const unsigned begins = h.server.beginMessages;
    h.connect();
    h.run();
    require(h.server.beginMessages == begins, "upload started for a dump that is gone");
    require(!h.reader.pending && h.uploader->step() == Uploader::Step::Idle, "record of a vanished dump kept");
    require(h.server.reports.size() == 1, "a vanished dump was reported");

    // Before the metadata: the report goes up without the dump.
    Harness early;
    early.reader.crash(5000);
    early.reader.dump.clear();
    early.connect();
    early.run();
    const auto &metadata = early.onlyReport().metadata;
    require(metadata["coredumpSize"].isNull() && metadata["coredumpCrc32"].isNull(), "vanished dump announced");
    require(early.server.beginMessages == 0, "upload started for a dump that is gone");
    require(!early.reader.pending, "record kept after a metadata-only report");
}

static void lostMetadataAckCreatesNoDuplicate()
{
    Harness h;
    h.reader.crash(43776);
    const auto dump = h.reader.dump;
    h.server.dropNext["READER_CRASH_REPORT"] = 1; // the report is stored, its ack is lost
    h.connect();
    h.run(400, 1000);
    require(h.server.metadataMessages == 2, "metadata not resent after the lost ack");
    expectStoredAndCleared(h, dump);
}

static void oddMetadataReplyKeepsTheDump()
{
    // Neither an upload offer nor a refusal: a transient failure, never a reason to give the dump up.
    Harness h;
    h.reader.crash(43776);
    const auto dump = h.reader.dump;
    h.server.overrideNext["READER_CRASH_REPORT"] = R"({"received":true,"id":100})";
    h.connect();
    for (int i = 0; i < 3; ++i) h.step();
    require(h.reader.pending && h.reader.pending->dump == fingerprintOf(dump), "dump given up");
    require(!h.reader.done.present(), "dump marked done without a refusal");
    require(h.uploader->step() == Uploader::Step::Start, "no retry scheduled");
    h.run(200, 1000);
    expectStoredAndCleared(h, dump);
}

static void noProgressChunkRepliesBackOff()
{
    const char *replies[] = {
        R"({"reportId":100,"error":"COREDUMP_OUT_OF_ORDER","expectedOffset":0})", // asks for the refused chunk
        R"({"reportId":100,"nextOffset":0})",                                      // acks without progress
    };
    for (const char *reply : replies)
    {
        Harness h;
        h.reader.crash(20000);
        const auto dump = h.reader.dump;
        h.server.overrideAlways["READER_COREDUMP_CHUNK"] = reply;
        h.connect();
        for (int i = 0; i < 120; ++i) h.step(1000);
        require(h.server.chunkMessages == FAILURES_BEFORE_LONG_RETRY,
                std::string("chunk resent without progress: ") + reply);
        require(h.uploader->step() == Uploader::Step::Start, "upload not paused");
        require(h.reader.pending && !h.reader.dump.empty(), "dump given up");
        h.server.overrideAlways.clear();
        h.run(600, 1000);
        expectStoredAndCleared(h, dump);
    }
}

static void pendingBlobVersions()
{
    PendingCrashBootRecord out{};
    CrashBootRecord record{};
    record.magic = BOOT_DIAG_MAGIC;
    record.uptimeMs = 77;
    require(decodePendingBlob(&record, sizeof(record), out) == PendingBlobKind::RecordOnly, "legacy record");
    require(out.record.uptimeMs == 77 && !out.dump.present() && out.phase == 0, "legacy record contents");

    PendingCrashBootRecordV1 v1{record, 6, BOOT_DIAG_PENDING_VERSION_1};
    require(decodePendingBlob(&v1, sizeof(v1), out) == PendingBlobKind::V1, "version 1 record");
    require(out.resetReason == 6 && out.version == BOOT_DIAG_PENDING_VERSION && out.firmwareVersion[0] == '\0',
            "version 1 contents");

    PendingCrashBootRecord v2{};
    v2.record = record;
    v2.version = BOOT_DIAG_PENDING_VERSION;
    v2.phase = static_cast<uint8_t>(CrashUploadPhase::DumpPending);
    v2.dump = {100, 5};
    v2.reportId = 9;
    snprintf(v2.firmwareVersion, sizeof(v2.firmwareVersion), "1.7.0");
    require(decodePendingBlob(&v2, sizeof(v2), out) == PendingBlobKind::V2, "version 2 record");
    require(out.reportId == 9 && out.dump == v2.dump && std::string(out.firmwareVersion) == "1.7.0", "v2 contents");

    v2.reportId = 0; // dump pending without a report is impossible
    require(decodePendingBlob(&v2, sizeof(v2), out) == PendingBlobKind::Invalid, "inconsistent v2 accepted");
    v1.version = 7;
    require(decodePendingBlob(&v1, sizeof(v1), out) == PendingBlobKind::Invalid, "unknown version accepted");
    record.magic = 0;
    require(decodePendingBlob(&record, sizeof(record), out) == PendingBlobKind::Invalid, "bad magic accepted");
    require(decodePendingBlob(&record, 3, out) == PendingBlobKind::Invalid, "short blob accepted");
}

static void encoders()
{
    // crash-report.cpp chains esp_rom_crc32_le over 512-byte reads; the server checks zlib's CRC-32.
    const uint8_t check[] = {'1', '2', '3', '4', '5', '6', '7', '8', '9'};
    require(esp_rom_crc32_le(0, check, sizeof(check)) == 0xCBF43926u, "crc32 check value");
    require(esp_rom_crc32_le(esp_rom_crc32_le(0, check, 4), check + 4, 5) == 0xCBF43926u, "crc32 is not incremental");
    const uint8_t text[] = {'f', 'o', 'o', 'b', 'a', 'r'};
    const char *expected[] = {"", "Zg==", "Zm8=", "Zm9v", "Zm9vYg==", "Zm9vYmE=", "Zm9vYmFy"};
    for (size_t n = 0; n <= sizeof(text); ++n)
    {
        char out[16] = {};
        require(base64Encode(text, n, out, sizeof(out)) == strlen(expected[n]), "base64 length");
        require(std::string(out) == expected[n], "base64 of foobar prefix");
    }
    char tiny[3];
    require(base64Encode(text, 3, tiny, sizeof(tiny)) == 0, "base64 overflow not refused");
    char noTerminator[4];
    require(base64Encode(text, 3, noTerminator, sizeof(noTerminator)) == 0, "no room for the terminator accepted");
}

int main()
{
    const std::vector<std::pair<std::string, std::function<void()>>> tests = {
        {"no dump: cleared after the metadata ack", noDumpClearsAfterMetadata},
        {"32 KiB - 1", [] { uploadsDumpOfSize(32 * 1024 - 1); }},
        {"exactly 32 KiB", [] { uploadsDumpOfSize(32 * 1024); }},
        {"32 KiB + 1", [] { uploadsDumpOfSize(32 * 1024 + 1); }},
        {"43,776 bytes (observed)", [] { uploadsDumpOfSize(43776); }},
        {"128 KiB (partition)", [] { uploadsDumpOfSize(PARTITION); }},
        {"over 128 KiB is refused once", tooLargeIsGivenUpOnce},
        {"metadata ack alone keeps the dump", metadataAckAloneKeepsTheDump},
        {"disconnect mid-upload", disconnectMidUploadResumesWithoutDuplicate},
        {"reboot mid-upload", rebootMidUploadResumes},
        {"low heap deferral", lowHeapDefersAndContinues},
        {"no upload during OTA", otaBlocksTheUpload},
        {"out-of-order resync", outOfOrderResyncs},
        {"lost chunk reply", lostChunkReplyTimesOutAndRetries},
        {"checksum mismatch backs off", checksumMismatchBacksOffThenRetries},
        {"rejected metadata", rejectedMetadataKeepsRecord},
        {"orphan dump", orphanDumpIsReportedOnItsOwn},
        {"record without dump, then orphan", recordWithoutDumpThenOrphan},
        {"report gone falls back to orphan once", reportGoneFallsBackToOrphanOnce},
        {"busy server", busyServerRetries},
        {"temporary BEGIN error retries", transientBeginErrorRetries},
        {"stored before a lost confirmation", storedBeforeLostConfirmation},
        {"stale dump never attached", staleDumpIsNeverAttached},
        {"record that owns the dump is kept", keepRecordThatOwnsTheDump},
        {"dump vanished from flash", dumpVanishedFromFlash},
        {"lost metadata ack", lostMetadataAckCreatesNoDuplicate},
        {"metadata reply without an upload offer", oddMetadataReplyKeepsTheDump},
        {"chunk replies without progress back off", noProgressChunkRepliesBackOff},
        {"pending record versions", pendingBlobVersions},
        {"crc32 and base64", encoders},
    };
    int failed = 0;
    for (const auto &[name, test] : tests)
    {
        try
        {
            test();
            std::cout << "ok   " << name << "\n";
        }
        catch (const std::exception &error)
        {
            ++failed;
            std::cout << "FAIL " << name << ": " << error.what() << "\n";
        }
    }
    return failed == 0 ? 0 : 1;
}
