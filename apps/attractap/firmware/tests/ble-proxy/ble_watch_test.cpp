// Host tests of the advertisement watch: BLE_WATCH_SET parsing, filters, change detection, keepalives, the device
// table, batching, the rate limit, backpressure and how its scan shares the radio with scans, sessions and OTA.
#include "ble_test_support.hpp"
#include "ble_adv.hpp"
#include "ble_watch.hpp"

namespace bletest
{
    namespace
    {
        constexpr uint16_t COMPANY = 0xffff;

        // Flags, a complete name and manufacturer data for COMPANY.
        std::vector<uint8_t> adv(const std::string &name, std::vector<uint8_t> data, uint16_t company = COMPANY)
        {
            std::vector<uint8_t> out = {2, 0x01, 0x06};
            if (!name.empty())
            {
                out.push_back(static_cast<uint8_t>(name.size() + 1));
                out.push_back(0x09);
                out.insert(out.end(), name.begin(), name.end());
            }
            out.push_back(static_cast<uint8_t>(data.size() + 3));
            out.push_back(0xff);
            out.push_back(static_cast<uint8_t>(company));
            out.push_back(static_cast<uint8_t>(company >> 8));
            out.insert(out.end(), data.begin(), data.end());
            return out;
        }

        std::string watchSet(uint32_t requestId, const std::string &filters, uint32_t keepaliveMs = 30000)
        {
            return "{\"v\":1,\"requestId\":" + std::to_string(requestId) + ",\"filters\":[" + filters +
                   "],\"keepaliveMs\":" + std::to_string(keepaliveMs) + "}";
        }

        const std::string MANUFACTURER_FILTER = "{\"id\":3,\"manufacturerIds\":[65535],\"serviceUuids\":[]}";

        std::string mac(int i)
        {
            char text[18];
            std::snprintf(text, sizeof text, "AA:BB:CC:00:%02X:%02X", (i >> 8) & 0xff, i & 0xff);
            return text;
        }

        struct WatchFixture : Fixture
        {
            void see(const std::string &address, const std::vector<uint8_t> &data, int8_t rssi = -60)
            {
                core.onAdvertisement(bletest::address(address.c_str()), rssi, true, data.data(), data.size(), now);
            }
            std::vector<JsonObjectConst> states() const { return sink.ofType("BLE_WATCH_STATE"); }
            std::vector<JsonObjectConst> eventMessages() const { return sink.ofType("BLE_WATCH_EVENT"); }
            std::vector<JsonObjectConst> events() const
            {
                std::vector<JsonObjectConst> out;
                for (JsonObjectConst message : eventMessages())
                    for (JsonObjectConst event : message["events"].as<JsonArrayConst>()) out.push_back(event);
                return out;
            }
            void tickAt(uint32_t ms)
            {
                now = ms;
                core.tick(now);
            }
            void watchOn(uint32_t keepaliveMs = 30000)
            {
                request("BLE_WATCH_SET", watchSet(7, MANUFACTURER_FILTER, keepaliveMs));
                expect(states().back()["active"] == true, "the watch scans");
            }
        };

        void parsesTheWatchSet()
        {
            Command command = make("BLE_WATCH_SET",
                                   watchSet(7,
                                            "{\"id\":3,\"manufacturerIds\":[65535],\"namePrefix\":\"dev-\",\"serviceUuids\":[]},"
                                            "{\"id\":9,\"serviceUuids\":[\"" + std::string(SVC) + "\"],\"namePrefix\":null}",
                                            15000));
            expect(command.type == CommandType::WatchSet && command.requestId == 7 && !command.sessionId[0],
                   "BLE_WATCH_SET needs no sessionId");
            expect(command.watchFilters.size() == 2 && command.keepaliveMs == 15000, "filters and keepalive");
            const WatchFilter &first = command.watchFilters[0];
            expect(first.id == 3 && first.manufacturers.size() == 1 && first.manufacturers[0] == 0xffff &&
                       first.hasNamePrefix && std::strcmp(first.namePrefix, "dev-") == 0 && first.services.empty(),
                   "first filter");
            expect(command.watchFilters[1].id == 9 && command.watchFilters[1].services.size() == 1 &&
                       !command.watchFilters[1].hasNamePrefix,
                   "second filter");
            expect(make("BLE_WATCH_SET", "{\"v\":1,\"requestId\":2,\"filters\":[]}").keepaliveMs ==
                       DEFAULT_WATCH_KEEPALIVE_MS,
                   "an empty set (the stop) parses, keepalive defaults");

            const auto refused = [](const std::string &payload, const char *detail) {
                JsonDocument doc;
                deserializeJson(doc, payload);
                Command c;
                Error error;
                expect(!parseCommand("BLE_WATCH_SET", doc.as<JsonObjectConst>(), c, error), "refused");
                expect(error.code == Code::InvalidArgument && std::strcmp(error.detail, detail) == 0, detail);
                return c;
            };
            std::string nine;
            for (int i = 0; i < 9; i++) nine += (i ? "," : "") + std::string("{\"id\":") + std::to_string(i) + ",\"manufacturerIds\":[1]}";
            Command tooMany = refused(watchSet(4, nine), "too-many-filters");
            refused(watchSet(4, MANUFACTURER_FILTER + "," + MANUFACTURER_FILTER), "duplicate-filter-id");
            refused(watchSet(4, MANUFACTURER_FILTER, 10), "keepalive");
            refused(watchSet(4, "{\"id\":70000}"), "filter");
            refused(watchSet(4, "{\"id\":1,\"serviceUuids\":[\"nope\"]}"), "filter");
            refused("{\"v\":1,\"requestId\":4}", "malformed");
            refused("{\"v\":2,\"requestId\":4,\"filters\":[]}", "protocol-version");

            // Its refusal (untrusted channel, malformed) is a BLE_WATCH_STATE that names the request.
            JsonDocument doc;
            deserializeJson(doc, refusalMessage(tooMany, Error(Code::ReaderUnsupported, "unauthenticated")));
            expect(std::strcmp(doc["data"]["type"] | "", "BLE_WATCH_STATE") == 0 && doc["data"]["payload"]["requestId"] == 4 &&
                       doc["data"]["payload"]["ok"] == false &&
                       std::strcmp(doc["data"]["payload"]["error"]["code"] | "", "READER_UNSUPPORTED") == 0,
                   "the refusal is a watch state");
        }

        void setStartsAndEmptySetStops()
        {
            WatchFixture f;
            f.request("BLE_WATCH_SET", "{\"v\":1,\"requestId\":1,\"filters\":[]}");
            expect(f.radio.initCalls == 0 && f.radio.calls.empty(), "an empty set never brings NimBLE up");
            expect(f.states().back()["ok"] == true && f.states().back()["active"] == false, "an empty set: inactive");

            f.request("BLE_WATCH_SET", watchSet(2, MANUFACTURER_FILTER));
            expect(f.radio.initCalls == 1 && f.radio.count("watch") == 1, "the first set brings NimBLE up and scans");
            JsonObjectConst state = f.states().back();
            expect(state["requestId"] == 2 && state["ok"] == true && state["active"] == true && state["sessionId"].isNull(),
                   "answered active");
            expect(f.core.watching() && f.core.owner() == BleProxyCore::Owner::None, "the watch is no owner");
            f.core.tick(f.now);
            expect(f.core.idle(), "a quiet watch lets the proxy task sleep");

            f.request("BLE_WATCH_SET", "{\"v\":1,\"requestId\":3,\"filters\":[]}");
            expect(f.radio.count("stopScan") == 1 && !f.core.watching(), "an empty set stops the scan");
            expect(f.states().back()["requestId"] == 3 && f.states().back()["active"] == false, "answered inactive");

            WatchFixture broken;
            broken.radio.initError = Error(Code::ReaderOffline, "no-sync");
            broken.request("BLE_WATCH_SET", watchSet(5, MANUFACTURER_FILTER));
            JsonObjectConst inactive = broken.states().back();
            expect(inactive["ok"] == true && inactive["active"] == false &&
                       std::strcmp(inactive["detail"] | "", "ble-init-failed") == 0,
                   "an init failure is answered inactive, with the reason");
            expect(!broken.core.watching() && !broken.core.idle(), "the watch stays and the proxy keeps trying");
            broken.radio.initError = Error();
            broken.tickAt(broken.now + WATCH_RETRY_MS - 1);
            expect(!broken.core.watching(), "not before the retry time");
            broken.tickAt(broken.now + 1);
            expect(broken.core.watching() && broken.radio.count("watch") == 1, "the radio came up: the watch scans");
            expect(broken.states().back()["active"] == true && !broken.states().back()["requestId"].is<int>(),
                   "and says so unsolicited");
        }

        void reportsChangesAndKeepalives()
        {
            WatchFixture f;
            f.watchOn(5000);
            f.see("AA:BB:CC:DD:EE:01", adv("dev-1A", {1, 2, 3}), -61);
            f.see("AA:BB:CC:DD:EE:02", adv("other", {1}, 0x004c)); // another company: no match
            f.core.tick(f.now);
            auto events = f.events();
            expect(events.size() == 1, "one matching device reported at once");
            JsonObjectConst e = events[0];
            expect(e["changed"] == true && e["filters"].size() == 1 && e["filters"][0] == 3, "first sight is a change");
            expect(std::strcmp(e["address"] | "", "AA:BB:CC:DD:EE:01") == 0 && std::strcmp(e["addressType"] | "", "public") == 0 &&
                       e["rssi"] == -61 && std::strcmp(e["name"] | "", "dev-1A") == 0,
                   "scan result shape");
            expect(e["manufacturerData"][0]["companyId"] == COMPANY &&
                       std::strcmp(e["manufacturerData"][0]["data"] | "", "AQID") == 0 && e["serviceUuids"].size() == 0,
                   "manufacturer data base64");
            expect(f.eventMessages()[0]["v"] == 1 && f.eventMessages()[0]["sessionId"].isNull(), "no session");

            // Same payload, other RSSI: nothing until the keepalive is due.
            f.tickAt(f.now + 1000);
            f.see("AA:BB:CC:DD:EE:01", adv("dev-1A", {1, 2, 3}), -40);
            f.core.tick(f.now);
            expect(f.events().size() == 1, "an RSSI change is no change");

            // The payload changes: reported at once.
            f.tickAt(f.now + 1000);
            f.see("AA:BB:CC:DD:EE:01", adv("dev-1A", {1, 2, 4}));
            f.core.tick(f.now);
            expect(f.events().size() == 2 && f.events()[1]["changed"] == true, "a payload change is reported at once");
            const uint32_t changedAt = f.now;

            // Unchanged and still seen after keepaliveMs: a keepalive. Not seen: nothing.
            f.tickAt(changedAt + 4999);
            f.see("AA:BB:CC:DD:EE:01", adv("dev-1A", {1, 2, 4}));
            f.core.tick(f.now);
            expect(f.events().size() == 2, "no keepalive before keepaliveMs");
            f.tickAt(changedAt + 5000);
            f.see("AA:BB:CC:DD:EE:01", adv("dev-1A", {1, 2, 4}), -70);
            f.core.tick(f.now);
            expect(f.events().size() == 3 && f.events()[2]["changed"] == false && f.events()[2]["rssi"] == -70,
                   "a keepalive while the device is seen");
            f.tickAt(changedAt + 20000);
            expect(f.events().size() == 3, "no keepalive for a device that is not seen");

            // Data a device spreads over several reports does not flap.
            f.see("AA:BB:CC:DD:EE:01", {4, 0x08, 'd', 'e', 'v'});
            f.core.tick(f.now);
            expect(f.events().size() == 4 && f.events()[3]["changed"] == false,
                   "a report without the manufacturer data is no change (only the due keepalive)");
        }

        void batchesAndRateLimits()
        {
            WatchFixture f;
            f.watchOn();
            const uint32_t start = f.now;
            for (int i = 0; i < 10; i++) f.see(mac(i), adv("d", {static_cast<uint8_t>(i)}));
            f.core.tick(f.now);
            expect(f.eventMessages().size() == 1 && f.eventMessages()[0]["events"].size() == MAX_WATCH_EVENTS_PER_MESSAGE,
                   "at most 8 events per message");
            f.tickAt(start + WATCH_BATCH_MS - 1);
            expect(f.eventMessages().size() == 1, "the next message waits for the batch window");
            f.tickAt(start + WATCH_BATCH_MS);
            expect(f.eventMessages().size() == 2 && f.eventMessages()[1]["events"].size() == 2, "the rest follows");

            // A flood: never more than maxEventsPerSecond in any second, changes before keepalives.
            WatchFixture g;
            g.watchOn(1000);
            const uint32_t t0 = g.now;
            std::vector<uint32_t> sentAt;
            for (uint32_t ms = 0; ms <= 3000; ms += 10)
            {
                g.now = t0 + ms;
                for (int i = 0; i < 30; i++) g.see(mac(i), adv("d", {static_cast<uint8_t>(i), static_cast<uint8_t>(ms / 500)}));
                const size_t before = g.events().size();
                g.core.tick(g.now);
                for (size_t k = before; k < g.events().size(); k++) sentAt.push_back(g.now);
            }
            for (size_t i = MAX_WATCH_EVENTS_PER_SECOND; i < sentAt.size(); i++)
                expect(sentAt[i] - sentAt[i - MAX_WATCH_EVENTS_PER_SECOND] >= 1000,
                       "no more than maxEventsPerSecond in any second");
            expect(sentAt.size() >= 2 * MAX_WATCH_EVENTS_PER_SECOND, "the budget refills");
            for (JsonObjectConst event : g.events()) expect(event["changed"] == true, "changes win over keepalives");
        }

        void tableIsBounded()
        {
            AdvertisementWatch watch;
            PsVector<WatchFilter> filters(1);
            filters[0].id = 1;
            filters[0].manufacturers.push_back(COMPANY);
            watch.set(std::move(filters), 30000, 0);
            const auto data = adv("", {1});
            AdvertisementWatch::Batch batch;
            for (int i = 0; i < 40; i++)
            {
                watch.onAdvertisement(address(mac(i).c_str()), -50, true, data.data(), data.size(), 1000 + i * 1000);
                std::string message = watch.nextMessage(1000 + i * 1000, batch);
                if (!message.empty()) watch.markSent(batch, 1000 + i * 1000);
            }
            expect(watch.deviceCount() == MAX_WATCH_DEVICES, "the table holds maxDevices");
            // The oldest went; a device seen again after eviction is new (a change).
            watch.onAdvertisement(address(mac(0).c_str()), -50, true, data.data(), data.size(), 50000);
            expect(!watch.nextMessage(50000, batch).empty() && batch.count == 1, "an evicted device comes back as a change");

            Advertisement a, b;
            mergeAdvertisingData(data.data(), data.size(), a);
            mergeAdvertisingData(data.data(), data.size(), b);
            b.rssi = -10;
            b.hasRssi = true;
            expect(advertisementHash(a) == advertisementHash(b), "the hash ignores the RSSI");
            const auto renamed = adv("x", {1});
            mergeAdvertisingData(renamed.data(), renamed.size(), b);
            expect(advertisementHash(a) != advertisementHash(b), "the hash covers the name");
        }

        void backpressureDropsKeepalivesFirst()
        {
            WatchFixture f;
            f.watchOn(1000);
            f.see(mac(1), adv("d", {1}));
            f.see(mac(2), adv("d", {2}));
            f.core.tick(f.now);
            expect(f.events().size() == 2, "both reported");
            f.sink.room = false;
            f.tickAt(f.now + 1500);
            f.see(mac(1), adv("d", {1}));     // keepalive due
            f.see(mac(2), adv("d", {2, 2}));  // change
            f.core.tick(f.now);
            expect(f.events().size() == 2, "nothing goes out while the websocket queue is full");
            f.sink.room = true;
            f.tickAt(f.now + 10);
            auto events = f.events();
            expect(events.size() == 3 && events[2]["changed"] == true &&
                       std::strcmp(events[2]["address"] | "", mac(2).c_str()) == 0,
                   "the change waited, the keepalive was dropped");
            f.see(mac(1), adv("d", {1}));
            f.tickAt(f.now + WATCH_BATCH_MS);
            expect(f.events().size() == 4 && f.events()[3]["changed"] == false, "the next report brings the keepalive back");

            // A send the websocket refuses keeps the change for the next try.
            f.sink.accept = false;
            f.see(mac(3), adv("d", {3}));
            f.tickAt(f.now + WATCH_BATCH_MS);
            f.sink.accept = true;
            f.tickAt(f.now + WATCH_BATCH_MS);
            expect(f.events().size() == 5 && std::strcmp(f.events()[4]["address"] | "", mac(3).c_str()) == 0, "resent");
        }

        void sharesTheRadio()
        {
            // An on-demand scan replaces the watch's scan and feeds it; the watch resumes after.
            WatchFixture f;
            f.watchOn();
            f.radio.calls.clear();
            f.request("BLE_SCAN", scanPayload(10));
            expect((f.radio.calls == std::vector<std::string>{"stopScan", "scan"}), "the watch steps aside for a scan");
            f.see(mac(1), adv("d", {1}));
            f.core.tick(f.now);
            expect(f.events().size() == 1, "the scan's reports feed the watch");
            expect(!f.core.watching(), "paused");
            f.core.onScanComplete(f.now);
            f.core.tick(f.now);
            expect(f.radio.calls.back() == "watch" && f.core.watching(), "and resumes after it");
            expect(f.states().size() == 1, "a scan's pause is not announced");

            // A session: paused while connecting, duty-cycled while connected, back to idle parameters after.
            f.radio.calls.clear();
            f.request("BLE_SESSION_OPEN", openPayload(11));
            expect((f.radio.calls == std::vector<std::string>{"stopScan", "connect"}), "NimBLE cannot scan and connect");
            f.core.tick(f.now);
            expect(!f.core.watching(), "paused while connecting");
            f.core.onConnected(address(ADDRESS), 247, f.now);
            f.core.tick(f.now);
            expect(f.radio.calls.back() == "watch-connected" && f.core.watching(), "runs beside the open session");
            f.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":12}");
            f.core.onDisconnected(0, f.now);
            f.core.tick(f.now);
            expect(f.radio.calls.back() == "watch" && f.core.watching(), "back to the idle duty cycle");

            // A failed connect resumes it too.
            f.request("BLE_SESSION_OPEN", openPayload(13, "sess-2"));
            f.core.onConnectFailed(Error(Code::ConnectionFailed, "hci:0x3e"), f.now);
            f.core.tick(f.now);
            expect(f.radio.calls.back() == "watch" && f.core.watching(), "resumes after a failed connect");
            expect(f.states().size() == 1, "nor is a session's");
        }

        void otaLinkLossAndRadioFailures()
        {
            WatchFixture f;
            f.watchOn();
            f.ota = true;
            f.core.otaStarted(f.now);
            JsonObjectConst paused = f.states().back();
            expect(paused["requestId"].isNull() && paused["active"] == false && std::strcmp(paused["detail"] | "", "ota") == 0,
                   "an OTA pauses it, announced");
            f.advance(500);
            expect(!f.core.watching() && f.states().size() == 2, "paused during the OTA");
            f.ota = false;
            f.advance(100);
            expect(f.core.watching() && f.states().back()["active"] == true && f.states().back()["requestId"].isNull(),
                   "a failed OTA resumes it, announced");

            f.core.linkLost(f.now);
            expect(!f.core.watching() && f.radio.calls.back() == "stopScan", "link lost: stopped");
            const size_t sent = f.sink.messages.size();
            f.see(mac(1), adv("d", {1}));
            f.advance(500);
            expect(f.sink.messages.size() == sent && f.core.idle(), "and forgotten: the API sends it again");

            // A set during an OTA waits for it.
            WatchFixture g;
            g.ota = true;
            g.request("BLE_WATCH_SET", watchSet(1, MANUFACTURER_FILTER));
            expect(g.states().back()["ok"] == true && g.states().back()["active"] == false &&
                       std::strcmp(g.states().back()["detail"] | "", "ota") == 0 && g.radio.initCalls == 0,
                   "kept during an OTA, NimBLE untouched");
            g.ota = false;
            g.advance(100);
            expect(g.core.watching() && g.radio.initCalls == 1, "starts after it");

            // The radio refuses the scan: answered inactive, retried, announced when it runs.
            WatchFixture h;
            h.radio.watchError = Error(Code::Internal, "nimble:rc=6");
            h.request("BLE_WATCH_SET", watchSet(1, MANUFACTURER_FILTER));
            expect(h.states().back()["ok"] == true && h.states().back()["active"] == false &&
                       std::strcmp(h.states().back()["detail"] | "", "nimble:rc=6") == 0,
                   "a refused scan is answered inactive with the reason");
            h.advance(WATCH_RETRY_MS - 100);
            expect(h.radio.count("watch") == 1 && h.states().size() == 1, "retried only after a pause, not re-announced");
            h.radio.watchError = Error();
            h.advance(200);
            expect(h.core.watching() && h.states().size() == 2 && h.states().back()["active"] == true, "recovered, announced");

            // The controller drops the scan: started again after a pause.
            h.core.onWatchScanEnded(h.now);
            expect(!h.core.watching() && !h.core.idle(), "lost");
            h.advance(WATCH_RETRY_MS + 100);
            expect(h.core.watching() && h.radio.count("watch") == 3, "restarted");
        }
        void watchHoldsTheStack()
        {
            // The idle shutdown frees the controller's RAM between exchanges; a standing watch scan is work, even
            // when the radio does not report it as such, so it must never lose its stack.
            WatchFixture f;
            f.watchOn();
            f.advance(3 * STACK_IDLE_SHUTDOWN_MS);
            expect(f.radio.count("shutdown") == 0 && f.core.watching() && f.core.radioReady(),
                   "a scanning watch keeps the stack up past the idle period");

            f.request("BLE_WATCH_SET", "{\"v\":1,\"requestId\":9,\"filters\":[]}");
            f.advance(STACK_IDLE_SHUTDOWN_MS - 300);
            expect(f.radio.count("shutdown") == 0, "the idle period starts once the watch ends");
            f.advance(400);
            expect(f.radio.count("shutdown") == 1 && !f.core.radioReady(), "then the stack shuts down");

            f.request("BLE_WATCH_SET", watchSet(10, MANUFACTURER_FILTER));
            expect(f.radio.initCalls == 2 && f.core.watching(), "a new watch brings a fresh stack up");
        }

    }

    void runWatchTests()
    {
        parsesTheWatchSet();
        setStartsAndEmptySetStops();
        reportsChangesAndKeepalives();
        batchesAndRateLimits();
        tableIsBounded();
        backpressureDropsKeepalivesFirst();
        sharesTheRadio();
        otaLinkLossAndRadioFailures();
        watchHoldsTheStack();
    }
}
