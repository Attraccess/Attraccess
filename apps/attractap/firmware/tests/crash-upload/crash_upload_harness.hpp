#pragma once
// Test fixture for crash_upload_test.cpp: in-memory reader ports (NVS, coredump flash, heap) and a fake
// server that implements the coredump upload protocol like crash-report.handler.ts. Included by that
// test only.
#include "api/diagnostics/coredump-upload.hpp"
// The host stand-in for the ROM CRC-32 that crash-report.cpp fingerprints the dump with.
#include "../reference-recordings/shim/esp_rom_crc.h"
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
    return {static_cast<uint32_t>(dump.size()),
            esp_rom_crc32_le(0, dump.data(), static_cast<uint32_t>(dump.size()))};
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
    std::function<void()> onSend; // sees the uploader as it is while a message goes out

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
    bool heapAvailable(size_t rawBytes, size_t messageBytes) override
    {
        largestHeapRequest = std::max(largestHeapRequest, rawBytes + messageBytes);
        return heapOk;
    }
    bool otaInProgress() override { return ota; }
    bool send(const char *json, size_t length) override
    {
        if (onSend) onSend();
        if (!sendOk) return false;
        largestMessage = std::max(largestMessage, length);
        outbox.emplace_back(json, length);
        return true;
    }
    const char *resetReasonName(uint8_t reason) override { return reason == 4 ? "PANIC" : "UNKNOWN"; }

    // A crash that writes a new dump, then the next boot's record (application_bootdiag.cpp).
    void crash(size_t dumpSize, uint8_t seed = 1, const char *firmware = "1.7.0")
    {
        dump = makeDump(dumpSize, seed);
        boot(true, firmware);
    }
    // A hung reader that was power-cycled: a record, but no dump of its own.
    void hang() { boot(false, "1.7.0"); }

    // What setupBootDiagnostics does after a crash-class (crashReset) or silent-hang reset.
    void boot(bool crashReset, const char *firmware)
    {
        PendingCrashBootRecord record{};
        record.record.magic = BOOT_DIAG_MAGIC;
        record.record.uptimeMs = 120000;
        record.record.freeInternalHeap = 40000;
        record.resetReason = crashReset ? 4 : 1;
        record.version = BOOT_DIAG_PENDING_VERSION;
        snprintf(record.firmwareVersion, sizeof(record.firmwareVersion), "%s", firmware);
        if (shouldAttachDump(crashReset, flashDump(), claimed, done))
        {
            record.dump = flashDump();
            claimed = record.dump;
        }
        if (keepPendingRecord(pending ? &*pending : nullptr, flashDump(), record.dump.present())) return;
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
    unsigned completeMessages = 0;
    // Test hooks: answer the next message (or every message) of this type with this payload instead.
    std::map<std::string, std::string> overrideNext;
    std::map<std::string, std::string> overrideAlways;
    // Handle the next message of this type, but lose the reply.
    std::map<std::string, unsigned> dropNext;
    // Runs right before the next READER_COREDUMP_BEGIN is handled (the reader sends it in reply to the
    // metadata ack, so a test cannot step in between otherwise).
    std::function<void(Server &)> beforeNextBegin;

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
        if (type == "READER_COREDUMP_COMPLETE") ++completeMessages;
        if (type == "READER_COREDUMP_BEGIN" && beforeNextBegin)
        {
            auto hook = std::move(beforeNextBegin);
            beforeNextBegin = nullptr;
            hook(*this);
        }

        if (dropNext[type] > 0)
        {
            --dropNext[type];
            apply(type, p, out); // received, but the reply is lost
            return std::nullopt;
        }
        if (overrideAlways.count(type))
        {
            require(!deserializeJson(out, overrideAlways[type]), "bad override");
            return std::make_pair(type, std::move(out));
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
            const uint32_t size = p["coredumpSize"] | 0u;
            const CrashDumpFingerprint announced{size, p["coredumpCrc32"] | 0u};
            // Resent metadata (its ack got lost) for a dump the reader already announced: the report
            // that still awaits that dump answers again, so no second report is created.
            for (const auto &[existingId, existing] : reports)
            {
                if (size > 0 && !existing.stored && existing.expected == announced)
                {
                    out["received"] = true;
                    out["id"] = existingId;
                    out["coredumpUpload"]["reportId"] = existingId;
                    out["coredumpUpload"]["chunkSize"] = 4096;
                    return;
                }
            }
            const uint32_t id = nextId++;
            Report &report = reports[id];
            report.metadata.set(p);
            out["received"] = true;
            out["id"] = id;
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
            else if (!report->second.expected.present()) out["error"] = "COREDUMP_NOT_EXPECTED"; // not awaiting
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

    Harness()
    {
        uploader.emplace(reader, logger);
        // A reply may arrive on another task as soon as the message is out: the uploader must already
        // wait for it (a failed send then replaces the step).
        reader.onSend = [this] {
            const Uploader::Step step = uploader->step();
            require(step == Uploader::Step::AwaitMetadata || step == Uploader::Step::AwaitBegin ||
                        step == Uploader::Step::AwaitChunk || step == Uploader::Step::AwaitComplete,
                    "a message went out before the uploader waited for its reply");
        };
    }
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
