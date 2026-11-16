// Crash report and chunked coredump upload (ATT-1144): the real state machine against a fake server that
// implements the protocol, with in-memory NVS and coredump flash.
#include "api/diagnostics/coredump-upload.hpp"
#include <cstring>
#include <functional>
#include <iostream>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

using namespace crashupload;

Logger::Logger(const char *name) : name(name) {}
void Logger::error(const char *) {}
void Logger::errorf(const char *, ...) {}

static void require(bool condition, const std::string &message)
{
    if (!condition) throw std::runtime_error(message);
}

static constexpr uint32_t PARTITION = CRASH_COREDUMP_PARTITION_BYTES;
static constexpr size_t SESSION_FRAME_LIMIT = 64 * 1024;

static std::vector<uint8_t> makeDump(size_t size, uint8_t seed = 1)
{
    std::vector<uint8_t> dump(size);
    uint32_t x = 0x12345678u ^ seed;
    for (auto &byte : dump)
    {
        x = x * 1664525u + 1013904223u;
        byte = static_cast<uint8_t>(x >> 24);
    }
    return dump;
}

static CrashDumpFingerprint fingerprintOf(const std::vector<uint8_t> &dump)
{
    if (dump.empty()) return {};
    return {static_cast<uint32_t>(dump.size()), crc32Update(0, dump.data(), dump.size())};
}

static std::vector<uint8_t> base64Decode(const std::string &text)
{
    auto value = [](char c) -> int {
        if (c >= 'A' && c <= 'Z') return c - 'A';
        if (c >= 'a' && c <= 'z') return c - 'a' + 26;
        if (c >= '0' && c <= '9') return c - '0' + 52;
        if (c == '+') return 62;
        if (c == '/') return 63;
        return -1;
    };
    std::vector<uint8_t> out;
    uint32_t buffer = 0;
    int bits = 0;
    for (char c : text)
    {
        if (c == '=') break;
        const int v = value(c);
        require(v >= 0, "invalid base64 character");
        buffer = (buffer << 6) | static_cast<uint32_t>(v);
        bits += 6;
        if (bits >= 8)
        {
            bits -= 8;
            out.push_back(static_cast<uint8_t>(buffer >> bits));
        }
    }
    return out;
}

// In-memory NVS, coredump partition and transport.
struct Reader : Ports
{
    std::optional<PendingCrashBootRecord> pending;
    std::string reboot;
    CrashDumpFingerprint claimed{};
    CrashDumpFingerprint done{};
    std::vector<uint8_t> dump;
    bool heapOk = true;
    bool ota = false;
    bool sendOk = true;
    unsigned erases = 0;
    size_t largestMessage = 0;
    size_t largestHeapRequest = 0;
    std::vector<std::string> outbox;

    bool loadPending(PendingCrashBootRecord &out) override
    {
        if (!pending) return false;
        out = *pending;
        return true;
    }
    void savePending(const PendingCrashBootRecord &record) override { pending = record; }
    void clearPending() override
    {
        pending.reset();
        reboot.clear();
    }
    std::string rebootReason() override { return reboot; }
    CrashDumpFingerprint claimedDump() override { return claimed; }
    void setClaimedDump(const CrashDumpFingerprint &fingerprint) override { claimed = fingerprint; }
    CrashDumpFingerprint doneDump() override { return done; }
    void setDoneDump(const CrashDumpFingerprint &fingerprint) override { done = fingerprint; }
    CrashDumpFingerprint flashDump() override { return fingerprintOf(dump); }
    bool readDump(uint32_t offset, uint8_t *out, size_t length) override
    {
        require(offset + length <= dump.size(), "read past the dump");
        memcpy(out, dump.data() + offset, length);
        return true;
    }
    bool eraseDump() override
    {
        ++erases;
        dump.clear();
        return true;
    }
    bool heapAvailable(size_t bytes) override
    {
        largestHeapRequest = std::max(largestHeapRequest, bytes);
        return heapOk;
    }
    bool otaInProgress() override { return ota; }
    bool send(const char *json, size_t length) override
    {
        if (!sendOk) return false;
        largestMessage = std::max(largestMessage, length);
        outbox.emplace_back(json, length);
        return true;
    }
    const char *resetReasonName(uint8_t reason) override { return reason == 4 ? "PANIC" : "UNKNOWN"; }

    void crash(size_t dumpSize, uint8_t seed = 1, const char *firmware = "1.7.0")
    {
        dump = makeDump(dumpSize, seed);
        PendingCrashBootRecord record{};
        record.record.magic = BOOT_DIAG_MAGIC;
        record.record.uptimeMs = 120000;
        record.record.freeInternalHeap = 40000;
        record.resetReason = 4;
        record.version = BOOT_DIAG_PENDING_VERSION;
        snprintf(record.firmwareVersion, sizeof(record.firmwareVersion), "%s", firmware);
        if (shouldAttachDump(true, flashDump(), claimed))
        {
            record.dump = flashDump();
            claimed = record.dump;
        }
        pending = record;
    }
};

// The server side of the protocol (crash-report.handler.ts), reduced to what the reader can observe.
struct Server
{
    struct Report
    {
        JsonDocument metadata;
        CrashDumpFingerprint expected{};
        std::optional<std::vector<uint8_t>> stored;
    };
    struct Assembly
    {
        uint32_t reportId;
        CrashDumpFingerprint declared;
        std::vector<uint8_t> bytes;
    };
    std::map<uint32_t, Report> reports;
    std::optional<Assembly> assembly;
    uint32_t nextId = 100;
    unsigned metadataMessages = 0;
    unsigned beginMessages = 0;
    unsigned chunkMessages = 0;
    // Test hooks: answer the next message of this type with this payload instead.
    std::map<std::string, std::string> overrideNext;
    std::map<std::string, unsigned> dropNext;

    std::optional<std::pair<std::string, JsonDocument>> handle(const std::string &message)
    {
        JsonDocument in;
        require(!deserializeJson(in, message), "reader sent invalid JSON");
        require(std::string(in["event"] | "") == "EVENT", "reader message is not an EVENT");
        const std::string type = in["data"]["type"] | "";
        JsonObjectConst p = in["data"]["payload"];
        JsonDocument out;
        if (type == "READER_CRASH_REPORT") ++metadataMessages;
        if (type == "READER_COREDUMP_BEGIN") ++beginMessages;
        if (type == "READER_COREDUMP_CHUNK") ++chunkMessages;

        if (dropNext[type] > 0)
        {
            --dropNext[type];
            if (type == "READER_COREDUMP_CHUNK") apply(type, p, out); // received, but the reply is lost
            return std::nullopt;
        }
        if (overrideNext.count(type))
        {
            require(!deserializeJson(out, overrideNext[type]), "bad override");
            overrideNext.erase(type);
            return std::make_pair(type, std::move(out));
        }
        apply(type, p, out);
        return std::make_pair(type, std::move(out));
    }

    void apply(const std::string &type, JsonObjectConst p, JsonDocument &out)
    {
        if (type == "READER_CRASH_REPORT")
        {
            const uint32_t id = nextId++;
            Report &report = reports[id];
            report.metadata.set(p);
            out["received"] = true;
            out["id"] = id;
            const uint32_t size = p["coredumpSize"] | 0u;
            if (size > PARTITION)
            {
                out["coredumpRejected"] = "COREDUMP_TOO_LARGE";
            }
            else if (size > 0)
            {
                report.expected = {size, p["coredumpCrc32"] | 0u};
                out["coredumpUpload"]["reportId"] = id;
                out["coredumpUpload"]["chunkSize"] = 4096;
            }
        }
        else if (type == "READER_COREDUMP_BEGIN")
        {
            const uint32_t id = p["reportId"] | 0u;
            out["reportId"] = id;
            const CrashDumpFingerprint declared{p["size"] | 0u, p["crc32"] | 0u};
            auto report = reports.find(id);
            if (report == reports.end()) out["error"] = "COREDUMP_REPORT_NOT_FOUND";
            else if (declared.size > PARTITION) out["error"] = "COREDUMP_TOO_LARGE";
            else if (report->second.stored && declared == report->second.expected) out["coredumpStored"] = true;
            else if (report->second.stored) out["error"] = "COREDUMP_ALREADY_STORED";
            else if (declared != report->second.expected) out["error"] = "COREDUMP_MISMATCH";
            else
            {
                assembly = Assembly{id, declared, {}};
                out["chunkSize"] = 4096;
                out["nextOffset"] = 0;
            }
        }
        else if (type == "READER_COREDUMP_CHUNK")
        {
            const uint32_t id = p["reportId"] | 0u;
            out["reportId"] = id;
            if (!assembly || assembly->reportId != id)
            {
                out["error"] = "COREDUMP_NO_UPLOAD";
                return;
            }
            const uint32_t offset = p["offset"] | 0u;
            const std::vector<uint8_t> data = base64Decode(p["data"] | "");
            require(!data.empty() && data.size() <= CHUNK_MAX_BYTES, "chunk size out of range");
            const uint32_t received = static_cast<uint32_t>(assembly->bytes.size());
            if (offset < received && offset + data.size() <= received)
            {
                out["nextOffset"] = received; // duplicate: re-ack
            }
            else if (offset != received)
            {
                out["error"] = "COREDUMP_OUT_OF_ORDER";
                out["expectedOffset"] = received;
            }
            else
            {
                require(received + data.size() <= assembly->declared.size, "chunk past the declared size");
                assembly->bytes.insert(assembly->bytes.end(), data.begin(), data.end());
                out["nextOffset"] = static_cast<uint32_t>(assembly->bytes.size());
            }
        }
        else if (type == "READER_COREDUMP_COMPLETE")
        {
            const uint32_t id = p["reportId"] | 0u;
            out["reportId"] = id;
            if (!assembly || assembly->reportId != id)
            {
                out["error"] = "COREDUMP_NO_UPLOAD";
                return;
            }
            const CrashDumpFingerprint got = fingerprintOf(assembly->bytes);
            const CrashDumpFingerprint declared{p["totalSize"] | 0u, p["crc32"] | 0u};
            if (got != assembly->declared || declared != assembly->declared)
            {
                out["error"] = got.size != declared.size ? "COREDUMP_SIZE_MISMATCH" : "COREDUMP_CHECKSUM_MISMATCH";
                assembly.reset();
                return;
            }
            reports[id].stored = assembly->bytes;
            assembly.reset();
            out["coredumpStored"] = true;
        }
        else
        {
            require(false, "unexpected reader event " + type);
        }
    }
};

struct Harness
{
    Reader reader;
    Server server;
    Logger logger{"test"};
    std::optional<Uploader> uploader;
    uint32_t now = 1000;

    Harness() { uploader.emplace(reader, logger); }
    void reboot() { uploader.emplace(reader, logger); }
    void connect() { uploader->onAuthenticated(now); }
    void disconnect()
    {
        uploader->onDisconnected();
        reader.outbox.clear();
        server.assembly.reset(); // the server drops a partial upload with the socket
    }

    // One API loop iteration: tick, then deliver the server's replies.
    void step(uint32_t advanceMs = 10)
    {
        uploader->tick(now);
        deliver();
        now += advanceMs;
    }
    void deliver()
    {
        while (!reader.outbox.empty())
        {
            const std::string message = reader.outbox.front();
            reader.outbox.erase(reader.outbox.begin());
            auto reply = server.handle(message);
            if (reply) uploader->onResponse(reply->first.c_str(), reply->second.as<JsonObjectConst>(), now);
        }
    }
    void run(unsigned iterations = 200, uint32_t advanceMs = 10)
    {
        for (unsigned i = 0; i < iterations && uploader->step() != Uploader::Step::Idle; ++i) step(advanceMs);
    }
    // Iterations until `chunks` coredump chunks went out.
    void runChunks(unsigned chunks)
    {
        const unsigned target = server.chunkMessages + chunks;
        for (unsigned i = 0; i < 1000 && server.chunkMessages < target; ++i) step();
    }
    const Server::Report &onlyReport()
    {
        require(server.reports.size() == 1, "expected exactly one report, got " + std::to_string(server.reports.size()));
        return server.reports.begin()->second;
    }
};

static void expectStoredAndCleared(Harness &h, const std::vector<uint8_t> &dump)
{
    const auto &report = h.onlyReport();
    require(report.stored.has_value(), "the dump was not stored");
    require(*report.stored == dump, "stored dump differs from flash");
    require(!h.reader.pending, "pending record not cleared after coredumpStored");
    require(h.reader.erases == 1, "dump not erased exactly once");
    require(h.reader.dump.empty(), "dump still in flash");
    require(h.reader.done == fingerprintOf(dump), "done fingerprint not recorded");
    require(h.uploader->step() == Uploader::Step::Idle, "uploader did not settle");
}

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

static void checksumMismatchRetriesThenWaitsForNextConnection()
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
    require(h.uploader->step() == Uploader::Step::Idle, "kept retrying past the limit");
    require(h.reader.pending && !h.reader.dump.empty(), "gave up the dump");
    h.disconnect();
    h.connect();
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
    require(h.uploader->step() == Uploader::Step::Idle, "retried in a loop after a rejection");
    h.connect();
    h.run();
    require(h.server.reports.size() == 1 && h.server.reports.begin()->second.stored, "retry after reconnect failed");
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
    Harness h;
    h.reader.crash(10000);
    h.connect();
    h.server.overrideNext["READER_COREDUMP_BEGIN"] = R"({"reportId":100,"error":"COREDUMP_REPORT_NOT_FOUND"})";
    h.run();
    require(h.server.reports.size() == 2 && h.server.reports[101].stored, "dump not recovered as an orphan");

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
    require(shouldAttachDump(true, dump, {}), "fresh crash dump not attached");
    require(!shouldAttachDump(false, dump, {}), "dump attached to a non-crash reset");
    require(!shouldAttachDump(true, dump, dump), "already claimed dump attached again");
    require(!shouldAttachDump(true, {}, {}), "missing dump attached");
    require(!shouldAttachDump(true, {PARTITION + 1, 1}, {}), "oversized dump attached");

    PendingCrashBootRecord owner{};
    owner.dump = dump;
    require(!isOrphanDump(dump, &owner, {}), "owned dump treated as orphan");
    require(isOrphanDump(dump, nullptr, {}), "unowned dump not an orphan");
    require(!isOrphanDump(dump, nullptr, dump), "finished dump treated as orphan");

    // A later crash whose dump write failed leaves the claimed dump (same bytes): the new record gets none.
    Harness h;
    h.reader.crash(43776);
    require(h.reader.pending->dump.present(), "first crash lost its dump");
    h.reader.crash(43776);
    require(!h.reader.pending->dump.present(), "stale dump attached to a newer crash");
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
    const uint8_t check[] = {'1', '2', '3', '4', '5', '6', '7', '8', '9'};
    require(crc32Update(0, check, sizeof(check)) == 0xCBF43926u, "crc32 check value");
    require(crc32Update(crc32Update(0, check, 4), check + 4, 5) == 0xCBF43926u, "crc32 is not incremental");
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
        {"checksum mismatch", checksumMismatchRetriesThenWaitsForNextConnection},
        {"rejected metadata", rejectedMetadataKeepsRecord},
        {"orphan dump", orphanDumpIsReportedOnItsOwn},
        {"record without dump, then orphan", recordWithoutDumpThenOrphan},
        {"report gone falls back to orphan once", reportGoneFallsBackToOrphanOnce},
        {"busy server", busyServerRetries},
        {"temporary BEGIN error retries", transientBeginErrorRetries},
        {"stored before a lost confirmation", storedBeforeLostConfirmation},
        {"stale dump never attached", staleDumpIsNeverAttached},
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
