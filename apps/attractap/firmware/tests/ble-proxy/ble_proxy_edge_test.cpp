// Bounds, edges and review regressions of the BLE proxy: the lease clock, a websocket that stops taking messages,
// buffered notifications across subscriptions, refusals outside the trusted channel, scan limits and the NimBLE
// status mapping.
#include "ble_core_detail.hpp"
#include "ble_errors.hpp"
#include "ble_test_support.hpp"

namespace bletest
{
    namespace
    {
        const char *INDICATE = "0000fff4-0000-1000-8000-00805f9b34fb"; // notify + indicate, n8
        const char *SVC2 = "0000fee0-0000-1000-8000-00805f9b34fb";    // a service outside the allowlist

        // RW, EVENTS (notify) and INDICATE (notify + indicate) under SVC.
        void openTwoStreams(Fixture &f)
        {
            const std::string payload =
                std::string("{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":1,\"address\":\"") + ADDRESS +
                "\",\"addressType\":\"public\",\"connectTimeoutMs\":5000,\"leaseMs\":60000,\"allowlist\":[{\"s\":\"" + SVC +
                "\",\"c\":\"" + RW + "\",\"ops\":3,\"r\":16,\"w\":8,\"n\":0},{\"s\":\"" + SVC + "\",\"c\":\"" + EVENTS +
                "\",\"ops\":8,\"r\":0,\"w\":0,\"n\":8},{\"s\":\"" + SVC + "\",\"c\":\"" + INDICATE +
                "\",\"ops\":24,\"r\":0,\"w\":0,\"n\":8}]}";
            f.request("BLE_SESSION_OPEN", payload);
            f.core.onConnected(address(ADDRESS), 247, f.now);
            expect(f.sink.code(1) == "OK", "the session opens");
        }

        std::string cancel(uint32_t requestId)
        {
            return "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":" + std::to_string(requestId) + "}";
        }

        std::vector<JsonObjectConst> notificationsOf(const FakeSink &sink, uint32_t subscriptionId)
        {
            std::vector<JsonObjectConst> out;
            for (JsonObjectConst n : sink.ofType("BLE_NOTIFICATION"))
                if (n["subscriptionId"].as<uint32_t>() == subscriptionId) out.push_back(n);
            return out;
        }

        const uint8_t ONE[] = {1};

        // ------------------------------------------------------------------------------------------- allowlist

        void knownCharacteristicUnderAnotherService()
        {
            Fixture f;
            f.open();
            f.request("BLE_READ", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":2,\"s\":\"" + std::string(SVC2) +
                                      "\",\"c\":\"" + RW + "\",\"timeoutMs\":1000}");
            expect(f.sink.code(2) == "UNKNOWN_CHARACTERISTIC" && f.radio.count("read") == 0,
                   "an allowlisted characteristic under another service is not in the allowlist");
        }

        void indicateWhereAllowed()
        {
            Fixture f;
            openTwoStreams(f);
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, INDICATE, ",\"indicate\":true"));
            expect(f.radio.count("cccd-indicate") == 1, "an allowed indicate writes the CCCD for indications");
            f.done();
            expect(f.sink.code(2) == "OK", "and subscribes");
        }

        void unsubscribeWithoutSubscription()
        {
            Fixture f;
            f.open();
            f.request("BLE_UNSUBSCRIBE", target("BLE_UNSUBSCRIBE", 2, EVENTS));
            expect(f.sink.code(2) == "OK" && f.radio.count("cccd-off") == 0,
                   "unsubscribing what is not subscribed succeeds without touching the peripheral");
        }

        // ------------------------------------------------------------------------------------------- deadlines

        void leaseStartsWhenTheSessionOpens()
        {
            Fixture f;
            f.request("BLE_SESSION_OPEN", openPayload(1, "sess-1", 5000));
            f.advance(4000); // a slow connect, within its deadline
            f.core.onConnected(address(ADDRESS), 247, f.now);
            expect(f.sink.code(1) == "OK", "the session opens late");
            f.advance(5000 + LEASE_GRACE_MS - 100);
            expect(f.radio.count("disconnect") == 0, "the lease counts from the open, like the API's");
            f.advance(200);
            expect(f.radio.count("disconnect") == 1, "and then ends the session");
        }

        void stuckOperationEndsWithTimeout()
        {
            Fixture f;
            f.open();
            f.request("BLE_READ", target("BLE_READ", 2, RW));
            f.advance(STUCK_OP_MS + 100);
            f.core.onDisconnected(0x216, f.now);
            auto ended = f.sink.ofType("BLE_SESSION_ENDED");
            expect(ended.size() == 1 && std::strcmp(ended[0]["reason"] | "", "timeout") == 0 &&
                       std::strcmp(ended[0]["detail"] | "", "stuck-op") == 0,
                   "a procedure NimBLE never finishes ends the session with reason timeout");
            expect(f.core.owner() == BleProxyCore::Owner::None && f.sink.answers(2).size() == 1, "free, answered once");
        }

        // ------------------------------------------------------------------------------------------- notifications

        void bufferBoundsByBytesAndCount()
        {
            NotificationBuffer bytes{32, 16};
            const uint8_t ten[10] = {};
            expect(bytes.push(uuid(SVC), uuid(EVENTS), ten, sizeof ten), "10 of 16 bytes fit");
            expect(!bytes.push(uuid(SVC), uuid(EVENTS), ten, sizeof ten), "20 of 16 bytes do not");
            NotificationBuffer::Entry entry;
            expect(bytes.size() == 2 && bytes.peek(entry) && entry.value.size() == 10 && !entry.overflow,
                   "the first stays, in front");
            bytes.removeOldest();
            expect(bytes.peek(entry) && entry.overflow, "followed by the overflow marker");
            expect(!bytes.push(uuid(SVC), uuid(EVENTS), ONE, 1) && bytes.size() == 1,
                   "an overflowed characteristic takes nothing more, not even a second marker");
            expect(bytes.push(uuid(SVC), uuid(RW), ten, sizeof ten), "the bytes of a removed entry are free again");

            NotificationBuffer count{2, 1024};
            expect(count.push(uuid(SVC), uuid(EVENTS), ONE, 1) && count.push(uuid(SVC), uuid(EVENTS), ONE, 1),
                   "two entries fit");
            expect(!count.push(uuid(SVC), uuid(EVENTS), ONE, 1) && count.size() == 3, "the third becomes a marker");
            count.removeOldest();
            count.removeOldest();
            expect(count.peek(entry) && entry.overflow && entry.value.empty(), "at the count limit");
        }

        void independentSequencesPerSubscription()
        {
            Fixture f;
            openTwoStreams(f);
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, EVENTS));
            f.done();
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 3, INDICATE));
            f.done();
            f.notifications.push(uuid(SVC), uuid(EVENTS), ONE, 1);
            f.notifications.push(uuid(SVC), uuid(INDICATE), ONE, 1);
            f.notifications.push(uuid(SVC), uuid(INDICATE), ONE, 1);
            f.notifications.push(uuid(SVC), uuid(EVENTS), ONE, 1);
            f.advance(100);
            auto events = notificationsOf(f.sink, 2), indications = notificationsOf(f.sink, 3);
            expect(events.size() == 2 && events[0]["seq"] == 1 && events[1]["seq"] == 2, "the first counts 1, 2");
            expect(indications.size() == 2 && indications[0]["seq"] == 1 && indications[1]["seq"] == 2,
                   "the second counts on its own");
        }

        void unsubscribeDropsWhatWasBuffered()
        {
            Fixture f;
            f.open();
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, EVENTS));
            f.done();
            f.sink.room = false;
            f.notifications.push(uuid(SVC), uuid(EVENTS), ONE, 1);
            f.notifications.push(uuid(SVC), uuid(EVENTS), ONE, 1);
            f.request("BLE_UNSUBSCRIBE", target("BLE_UNSUBSCRIBE", 3, EVENTS));
            f.done();
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 4, EVENTS));
            f.done();
            f.sink.room = true;
            f.notifications.push(uuid(SVC), uuid(EVENTS), ONE, 1);
            f.advance(100);
            auto n = f.sink.ofType("BLE_NOTIFICATION");
            expect(n.size() == 1 && n[0]["subscriptionId"] == 4 && n[0]["seq"] == 1,
                   "the old subscription's buffered notifications never reach the new one");
        }

        void resubscribeDropsWhatWasBuffered()
        {
            Fixture f;
            f.open();
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, EVENTS));
            f.done();
            f.sink.room = false;
            for (int i = 0; i < 5; i++) f.notifications.push(uuid(SVC), uuid(EVENTS), ONE, 1); // 4 + overflow marker
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 3, EVENTS));
            f.done();
            expect(f.notifications.size() == 0, "subscribing again drops the old buffer and its marker");
            f.sink.room = true;
            f.notifications.push(uuid(SVC), uuid(EVENTS), ONE, 1);
            f.advance(100);
            auto n = f.sink.ofType("BLE_NOTIFICATION");
            expect(n.size() == 1 && n[0]["subscriptionId"] == 3 && n[0]["seq"] == 1 && n[0]["error"].isNull(),
                   "the new subscription starts at seq 1, without the old overflow");
        }

        // ------------------------------------------------------------------------------------------- outbound

        // Found in review: notifications popped into the outbox while the websocket refused, until answers were dropped.
        void refusedNotificationsNeverCrowdOutAnswers()
        {
            Fixture f;
            f.open();
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, EVENTS));
            f.done();
            f.sink.accept = false; // the send queue looks free but takes nothing
            for (int round = 0; round < 20; round++)
            {
                for (int i = 0; i < 4; i++) f.notifications.push(uuid(SVC), uuid(EVENTS), ONE, 1);
                f.advance(100);
            }
            f.request("BLE_READ", target("BLE_READ", 3, RW, "", "sess-1", 60000));
            f.done(Error(), Bytes{7});
            f.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":4}");
            f.core.onDisconnected(0x216, f.now);
            f.sink.accept = true;
            f.advance(100);
            expect(f.sink.code(3) == "OK" && f.sink.code(4) == "OK", "the read and the close are answered");
            expect(f.sink.ofType("BLE_SESSION_ENDED").size() == 1, "and the session end goes out");
        }

        void backlogKeepsOrderAndOverflowsWithAMarker()
        {
            Fixture f;
            f.open();
            f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, EVENTS));
            f.done();
            f.sink.accept = false;
            for (int i = 0; i < 6; i++) f.notifications.push(uuid(SVC), uuid(EVENTS), ONE, 1);
            f.advance(300);
            f.sink.accept = true;
            f.advance(100);
            auto n = notificationsOf(f.sink, 2);
            expect(n.size() == 5, "the four buffered ones and the marker");
            for (size_t i = 0; i < n.size(); i++) expect(n[i]["seq"] == i + 1, "seq without a gap");
            expect(std::strcmp(n.back()["error"]["code"] | "", "NOTIFICATION_OVERFLOW") == 0, "the overflow is reported");
        }

        void outboxBoundsRequestsInsteadOfDroppingAnswers()
        {
            Fixture f;
            expect(f.core.idle() && f.core.acceptsRequests(), "nothing to do at boot");
            f.open();
            for (uint32_t id = 10; id < 10 + MAX_PENDING_REQUESTS + 1; id++)
                f.request("BLE_READ", target("BLE_READ", id, RW, "", "sess-1", 60000));
            f.sink.accept = false;
            uint32_t id = 100;
            while (f.core.acceptsRequests()) f.request("BLE_READ", target("BLE_READ", id++, OTHER));
            expect(id - 100 == core_detail::MAX_OUTBOX - core_detail::OUTBOX_RESERVE,
                   "requests stop while the outbox only has room for what accepted work still owes");
            f.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":200}");
            f.core.onDisconnected(0x216, f.now);
            expect(!f.core.idle(), "a full outbox keeps the proxy task polling");
            f.sink.accept = true;
            f.advance(100);
            for (uint32_t queued = 10; queued < 10 + MAX_PENDING_REQUESTS + 1; queued++)
                expect(f.sink.answers(queued).size() == 1, "every queued read is answered once");
            expect(f.sink.code(200) == "OK" && f.sink.ofType("BLE_SESSION_ENDED").size() == 1, "close and end too");
            expect(f.core.idle() && f.core.acceptsRequests(), "then the task may sleep again");
        }

        // ------------------------------------------------------------------------------------------- refusals

        void untrustedRequestsAreRefusedByRequestId()
        {
            Command read = make("BLE_READ", target("BLE_READ", 5, RW));
            JsonDocument doc;
            expect(!deserializeJson(doc, refusalMessage(read, Error(Code::ReaderUnsupported, "unauthenticated"))),
                   "the refusal is JSON");
            JsonObjectConst payload = doc["data"]["payload"];
            expect(std::strcmp(doc["data"]["type"] | "", "BLE_RESULT") == 0 && payload["requestId"] == 5 &&
                       std::strcmp(payload["error"]["code"] | "", "READER_UNSUPPORTED") == 0 &&
                       std::strcmp(payload["error"]["detail"] | "", "unauthenticated") == 0,
                   "an untrusted request gets READER_UNSUPPORTED unauthenticated");
            Command scan = make("BLE_SCAN", scanPayload(6));
            doc.clear();
            deserializeJson(doc, refusalMessage(scan, Error(Code::ReaderUnsupported, "unauthenticated")));
            expect(std::strcmp(doc["data"]["type"] | "", "BLE_SCAN_RESULT") == 0, "a scan as a scan result");
            expect(refusalMessage(make("BLE_CANCEL", cancel(5)), Error(Code::ReaderUnsupported)).empty(),
                   "a cancel is never answered");
            Command anonymous;
            expect(refusalMessage(anonymous, Error(Code::ReaderUnsupported)).empty(), "nor what cannot be addressed");
        }

        // ------------------------------------------------------------------------------------------- scan

        bool parses(const std::string &payload, Command &command)
        {
            JsonDocument doc;
            deserializeJson(doc, payload);
            Error error;
            return parseCommand("BLE_SCAN", doc.as<JsonObjectConst>(), command, error);
        }

        std::string scanWith(const std::string &fields)
        {
            return "{\"v\":1,\"sessionId\":\"scan-1\",\"requestId\":1," + fields + "}";
        }

        void scanBounds()
        {
            const std::string filter = ",\"filter\":{\"serviceUuids\":[],\"manufacturerIds\":[4660]}";
            Command command;
            expect(!parses(scanWith("\"durationMs\":15001" + filter), command), "a scan above 15 s is refused");
            Command bounded;
            expect(!parses(scanWith("\"durationMs\":1000,\"maxResults\":33" + filter), bounded),
                   "more than 32 results are refused");
            Command defaults;
            expect(parses(scanWith("\"durationMs\":15000" + filter), defaults) && defaults.maxResults == 32,
                   "15 s is allowed and maxResults defaults to 32");

            Fixture f;
            f.request("BLE_SCAN", scanWith("\"durationMs\":1000" + filter));
            const uint8_t wanted[] = {5, 0xff, 0x34, 0x12, 0x01, 0x02};
            const uint8_t other[] = {5, 0xff, 0x99, 0x99, 0x01, 0x02};
            f.core.onAdvertisement(address("AA:BB:CC:DD:EE:01"), -50, true, other, sizeof other);
            f.core.onAdvertisement(address("AA:BB:CC:DD:EE:02"), -50, true, wanted, sizeof wanted);
            f.core.onScanComplete(f.now);
            JsonArrayConst ads = f.sink.answer(1)["advertisements"].as<JsonArrayConst>();
            expect(ads.size() == 1 && std::strcmp(ads[0]["address"] | "", "AA:BB:CC:DD:EE:02") == 0,
                   "a manufacturer id filter matches its company only");
        }

        // ------------------------------------------------------------------------------------------- mapping

        void errorMappingEdges()
        {
            Error e = mapGattStatus(nimble::HS_ETIMEOUT_HCI);
            expect(e.code == Code::Timeout && std::strcmp(e.detail, "nimble:rc=19") == 0, "HCI timeout: TIMEOUT");
            e = mapGattStatus(nimble::ERR_HCI_BASE + nimble::HCI_CONN_SPVN_TMO);
            expect(e.code == Code::Internal && std::strcmp(e.detail, "hci:0x08") == 0, "an HCI status in a GATT result");
            char detail[40];
            disconnectDetail(nimble::HS_ETIMEOUT, detail, sizeof detail);
            expect(std::strcmp(detail, "nimble:rc=13") == 0, "a disconnect without an HCI reason keeps the host code");
            e = mapGattStatus(nimble::ERR_ATT_BASE);
            expect(e.code == Code::Internal && std::strcmp(e.detail, "nimble:rc=256") == 0,
                   "the ATT base itself is no ATT error");
            e = mapGattStatus(nimble::ERR_ATT_BASE + 0xff);
            expect(e.code == Code::GattError && std::strcmp(e.detail, "att:0xff") == 0, "the last ATT error");
            e = mapGattStatus(nimble::ERR_HCI_BASE);
            expect(e.code == Code::Internal && std::strcmp(e.detail, "nimble:rc=512") == 0, "the HCI base itself neither");
            e = mapConnectFailure(nimble::HS_ECONTROLLER);
            expect(e.code == Code::ConnectionFailed && std::strcmp(e.detail, "nimble:rc=12") == 0,
                   "other connect failures keep the host code");
        }
    }

    void runEdgeTests()
    {
        knownCharacteristicUnderAnotherService();
        indicateWhereAllowed();
        unsubscribeWithoutSubscription();
        leaseStartsWhenTheSessionOpens();
        stuckOperationEndsWithTimeout();
        bufferBoundsByBytesAndCount();
        independentSequencesPerSubscription();
        unsubscribeDropsWhatWasBuffered();
        resubscribeDropsWhatWasBuffered();
        refusedNotificationsNeverCrowdOutAnswers();
        backlogKeepsOrderAndOverflowsWithAMarker();
        outboxBoundsRequestsInsteadOfDroppingAnswers();
        untrustedRequestsAreRefusedByRequestId();
        scanBounds();
        errorMappingEdges();
    }
}
