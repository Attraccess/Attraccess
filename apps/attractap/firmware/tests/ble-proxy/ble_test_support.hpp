#pragma once

// Fakes and helpers shared by the BLE proxy host tests: a radio and a websocket that record what the state machine
// does, request builders, and a fixture with a fake clock.
#include "ble_codec.hpp"
#include "ble_core.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <string>
#include <vector>

namespace bletest
{
    using namespace ble;

    inline void expect(bool condition, const char *message)
    {
        if (!condition)
        {
            std::fprintf(stderr, "FAIL: %s\n", message);
            std::exit(1);
        }
    }

    inline constexpr const char *SVC = "0000fff0-0000-1000-8000-00805f9b34fb";
    inline constexpr const char *RW = "0000fff1-0000-1000-8000-00805f9b34fb";     // read + write, r16 w8
    inline constexpr const char *EVENTS = "0000fff2-0000-1000-8000-00805f9b34fb"; // notify, n8
    inline constexpr const char *BULK = "0000fff3-0000-1000-8000-00805f9b34fb";   // writeWithoutResponse, w200
    inline constexpr const char *OTHER = "0000fff9-0000-1000-8000-00805f9b34fb";  // not in the allowlist
    inline constexpr const char *ADDRESS = "AA:BB:CC:DD:EE:01";

    struct FakeRadio : IBleRadio
    {
        std::vector<std::string> calls;
        std::deque<Start> starts;
        Error initError;
        Error connectError;
        Error failError = Error(Code::GattError, "att:0x0e");
        uint32_t lastToken = 0;
        int initCalls = 0;

        Error init() override
        {
            initCalls++;
            return initError;
        }
        Error startScan(uint32_t) override
        {
            calls.push_back("scan");
            return Error();
        }
        void stopScan() override { calls.push_back("stopScan"); }
        Error connect(const Address &, uint32_t, const PsVector<AllowEntry> &) override
        {
            calls.push_back("connect");
            return connectError;
        }
        void cancelConnect() override { calls.push_back("cancelConnect"); }
        void disconnect() override { calls.push_back("disconnect"); }
        Start op(const char *name, uint32_t token, Error &error)
        {
            calls.push_back(name);
            lastToken = token;
            Start start = Start::Pending;
            if (!starts.empty())
            {
                start = starts.front();
                starts.pop_front();
            }
            if (start == Start::Failed) error = failError;
            return start;
        }
        Start read(uint32_t token, const Uuid &, const Uuid &, Error &error) override { return op("read", token, error); }
        Start write(uint32_t token, const Uuid &, const Uuid &, const Bytes &, bool withoutResponse, Error &error) override
        {
            return op(withoutResponse ? "wwr" : "write", token, error);
        }
        Start setNotifications(uint32_t token, const Uuid &, const Uuid &, uint8_t mode, Error &error) override
        {
            return op(mode == 0 ? "cccd-off" : mode == 1 ? "cccd-notify" : "cccd-indicate", token, error);
        }
        size_t count(const std::string &name) const
        {
            size_t n = 0;
            for (const auto &call : calls) n += call == name;
            return n;
        }
    };

    struct FakeSink : IBleSink
    {
        std::vector<JsonDocument> messages;
        bool accept = true;
        bool room = true;
        bool send(const std::string &message) override
        {
            if (!accept) return false;
            JsonDocument doc;
            expect(!deserializeJson(doc, message), "the proxy sends valid JSON");
            messages.push_back(doc);
            return true;
        }
        bool canSendNotification() override { return room; }

        std::vector<JsonObjectConst> ofType(const char *type) const
        {
            std::vector<JsonObjectConst> out;
            for (const auto &doc : messages)
                if (std::strcmp(doc["data"]["type"] | "", type) == 0) out.push_back(doc["data"]["payload"].as<JsonObjectConst>());
            return out;
        }
        // Every answer (BLE_RESULT or BLE_SCAN_RESULT) for a request.
        std::vector<JsonObjectConst> answers(uint32_t requestId) const
        {
            std::vector<JsonObjectConst> out;
            for (const char *type : {"BLE_RESULT", "BLE_SCAN_RESULT"})
                for (JsonObjectConst p : ofType(type))
                    if (p["requestId"].as<uint32_t>() == requestId) out.push_back(p);
            return out;
        }
        JsonObjectConst answer(uint32_t requestId) const
        {
            auto all = answers(requestId);
            expect(all.size() == 1, "every request is answered exactly once");
            return all[0];
        }
        std::string code(uint32_t requestId) const { return std::string(answer(requestId)["error"]["code"] | "OK"); }
        std::string detail(uint32_t requestId) const { return std::string(answer(requestId)["error"]["detail"] | ""); }
    };

    inline Command make(const char *type, const std::string &payload, uint32_t now = 0)
    {
        JsonDocument doc;
        expect(!deserializeJson(doc, payload), "test payload is JSON");
        Command command;
        Error error;
        const bool parsed = parseCommand(type, doc.as<JsonObjectConst>(), command, error);
        if (!parsed) std::fprintf(stderr, "parse failed: %s %s\n", codeName(error.code), error.detail);
        expect(parsed, "the test request parses");
        command.receivedMs = now;
        return command;
    }

    inline std::string target(const char *type, uint32_t requestId, const char *characteristic, const std::string &extra = "",
                       const char *session = "sess-1", uint32_t timeoutMs = 1000)
    {
        (void)type;
        return std::string("{\"v\":1,\"sessionId\":\"") + session + "\",\"requestId\":" + std::to_string(requestId) +
               ",\"s\":\"" + SVC + "\",\"c\":\"" + characteristic + "\",\"timeoutMs\":" + std::to_string(timeoutMs) +
               extra + "}";
    }

    inline std::string openPayload(uint32_t requestId, const char *session = "sess-1", uint32_t leaseMs = 60000)
    {
        return std::string("{\"v\":1,\"sessionId\":\"") + session + "\",\"requestId\":" + std::to_string(requestId) +
               ",\"address\":\"" + ADDRESS + "\",\"addressType\":\"public\",\"connectTimeoutMs\":5000,\"leaseMs\":" +
               std::to_string(leaseMs) + ",\"allowlist\":[{\"s\":\"" + SVC + "\",\"c\":\"" + RW +
               "\",\"ops\":3,\"r\":16,\"w\":8,\"n\":0},{\"s\":\"" + SVC + "\",\"c\":\"" + EVENTS +
               "\",\"ops\":8,\"r\":0,\"w\":0,\"n\":8},{\"s\":\"" + SVC + "\",\"c\":\"" + BULK +
               "\",\"ops\":4,\"r\":0,\"w\":200,\"n\":0}]}";
    }

    inline std::string scanPayload(uint32_t requestId, const char *session = "scan-1", uint32_t durationMs = 3000)
    {
        return std::string("{\"v\":1,\"sessionId\":\"") + session + "\",\"requestId\":" + std::to_string(requestId) +
               ",\"durationMs\":" + std::to_string(durationMs) + ",\"maxResults\":2,\"filter\":{\"serviceUuids\":[\"" +
               SVC + "\"],\"manufacturerIds\":[],\"namePrefix\":\"Demo\"}}";
    }

    inline Address address(const char *text)
    {
        Address out;
        expect(parseAddress(text, out), "test address parses");
        return out;
    }

    inline Uuid uuid(const char *text)
    {
        Uuid out;
        expect(parseUuid(text, out), "test uuid parses");
        return out;
    }

    struct Fixture
    {
        FakeRadio radio;
        FakeSink sink;
        NotificationBuffer notifications{4, 64};
        BleProxyCore core{radio, sink, notifications};
        bool ota = false;
        uint32_t now = 1000;

        Fixture()
        {
            core.setOtaActive([this]() { return ota; });
        }

        // An open session with the given MTU.
        void open(uint16_t mtu = 247, uint32_t leaseMs = 60000)
        {
            core.handle(make("BLE_SESSION_OPEN", openPayload(1, "sess-1", leaseMs), now), now);
            core.onConnected(address(ADDRESS), mtu, now);
            expect(sink.code(1) == "OK", "the session opens");
            expect(sink.answer(1)["mtu"].as<uint16_t>() == mtu, "the open result reports the MTU");
        }
        void request(const char *type, const std::string &payload) { core.handle(make(type, payload, now), now); }
        void advance(uint32_t ms)
        {
            // In 100 ms steps, like the proxy task's wakeups.
            for (uint32_t step = 0; step < ms; step += 100)
            {
                now += std::min<uint32_t>(100, ms - step);
                core.tick(now);
            }
        }
        void done(const Error &error = Error(), Bytes value = Bytes()) { core.onOpDone(radio.lastToken, error, std::move(value), now); }
    };

    // ble_proxy_edge_test.cpp: bounds, edges and regressions found in review.
    void runEdgeTests();
}
