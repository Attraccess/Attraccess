// The BLE proxy is the reader-side boundary of plugin Bluetooth (ATT-1033/ATT-1036): it must refuse anything
// outside the session's allowlist before the radio sees it, keep one owner at a time, enforce its own deadlines
// when the API goes silent, answer every request exactly once and never drop a notification silently.
#include "ble_adv.hpp"
#include "ble_capability.hpp"
#include "ble_errors.hpp"
#include "ble_test_support.hpp"
#include "ui_capabilities.hpp"

#include <map>

using namespace bletest;

namespace
{
    // ------------------------------------------------------------------------------------------- codec

    void codecRoundTripsAndBoundsBase64()
    {
        Bytes data;
        for (int i = 0; i < 512; i++) data.push_back(static_cast<uint8_t>(i * 7));
        std::string text;
        base64Encode(data.data(), data.size(), text);
        Bytes back;
        expect(base64Decode(text.c_str(), text.size(), 512, back) && back == data, "512 bytes round-trip");
        expect(!base64Decode(text.c_str(), text.size(), 511, back), "a value above the bound is refused");
        const std::string tooLong(4 * 172 + 4, 'A');
        expect(!base64Decode(tooLong.c_str(), tooLong.size(), 512, back) && back.empty(),
               "an over-long value is refused by its encoded length, before decoding");
        expect(!base64Decode("QUJD!A==", 8, 512, back), "invalid characters are refused");
        expect(!base64Decode("QQ=A", 4, 512, back), "padding only at the end");
        expect(!base64Decode("QUJ", 3, 512, back), "length must be a multiple of four");
        expect(base64Decode("QQ==", 4, 512, back) && back.size() == 1 && back[0] == 'A', "padded value decodes");
    }

    void codecParsesAndRefuses()
    {
        JsonDocument doc;
        deserializeJson(doc, std::string("{\"v\":2,\"sessionId\":\"s\",\"requestId\":7}"));
        Command command;
        Error error;
        expect(!parseCommand("BLE_READ", doc.as<JsonObjectConst>(), command, error), "unknown v is refused");
        expect(error.code == Code::InvalidArgument && std::strcmp(error.detail, "protocol-version") == 0 &&
                   command.requestId == 7,
               "with INVALID_ARGUMENT protocol-version, answerable by requestId");

        Uuid out;
        expect(!parseUuid("0000FFF0-0000-1000-8000-00805F9B34FB", out), "uppercase UUIDs are not from the API");
        expect(!parseUuid("fff0", out), "short UUIDs are not from the API");
        Address a;
        expect(parseAddress("aa:bb:cc:dd:ee:0f", a) && a.b[5] == 0x0f, "addresses parse in either case");
        expect(!parseAddress("AA-BB-CC-DD-EE-0F", a), "only colon separated");
        char text[18];
        formatAddress(a, text);
        expect(std::strcmp(text, "AA:BB:CC:DD:EE:0F") == 0, "addresses go out uppercase");

        Command write;
        Error writeError;
        JsonDocument big;
        std::string value(700, 'A');
        deserializeJson(big, target("BLE_WRITE", 3, RW, ",\"value\":\"" + value + "\""));
        expect(!parseCommand("BLE_WRITE", big.as<JsonObjectConst>(), write, writeError) &&
                   writeError.code == Code::PayloadTooLarge,
               "a write value above 512 bytes is PAYLOAD_TOO_LARGE");

        JsonDocument cancel;
        deserializeJson(cancel, "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":9}");
        Command c;
        Error e;
        expect(parseCommand("BLE_CANCEL", cancel.as<JsonObjectConst>(), c, e) && c.requestId == 0 && c.targetRequestId == 9,
               "a cancel names its target and gets no answer of its own");
        expect(isRequestType("BLE_SESSION_OPEN") && !isRequestType("BLE_RESULT"), "only server requests are handled");

        // Found on hardware: an unsubscribe the API sent without a deadline was refused as malformed.
        JsonDocument noDeadline;
        deserializeJson(noDeadline, "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":10,"
                                    "\"s\":\"0000fff0-0000-1000-8000-00805f9b34fb\","
                                    "\"c\":\"0000fff2-0000-1000-8000-00805f9b34fb\"}");
        Command unsubscribe;
        Error unsubscribeError;
        expect(parseCommand("BLE_UNSUBSCRIBE", noDeadline.as<JsonObjectConst>(), unsubscribe, unsubscribeError) &&
                   unsubscribe.timeoutMs == DEFAULT_OP_TIMEOUT_MS,
               "an operation without timeoutMs gets the default deadline");
    }

    // ------------------------------------------------------------------------------------------- ownership

    void oneOwnerAtATime()
    {
        Fixture f;
        f.request("BLE_SCAN", scanPayload(1));
        f.request("BLE_SCAN", scanPayload(2, "scan-2"));
        expect(f.sink.code(2) == "READER_BUSY", "scan vs scan: READER_BUSY");
        f.request("BLE_SESSION_OPEN", openPayload(3, "sess-x"));
        expect(f.sink.code(3) == "READER_BUSY" && f.sink.detail(3) == "busy", "open vs scan: READER_BUSY");
        expect(f.radio.count("connect") == 0 && f.radio.count("scan") == 1, "the radio saw one scan only");
        f.advance(3000);
        expect(f.sink.code(1) == "OK", "the scan finishes on its own deadline");

        Fixture g;
        g.open();
        g.request("BLE_SESSION_OPEN", openPayload(5, "sess-2"));
        expect(g.sink.code(5) == "READER_BUSY", "open vs open: READER_BUSY");
        g.request("BLE_SCAN", scanPayload(6));
        expect(g.sink.code(6) == "READER_BUSY", "scan vs session: READER_BUSY");
        expect(g.radio.count("connect") == 1 && g.radio.count("scan") == 0, "nothing reached the radio");
        expect(g.radio.initCalls == 1, "NimBLE comes up once, on the first request");
    }

    void initFailureIsReportedNotFatal()
    {
        Fixture f;
        f.radio.initError = Error(Code::ReaderOffline, "esp:0x101");
        f.request("BLE_SCAN", scanPayload(1));
        expect(f.sink.code(1) == "READER_OFFLINE" && f.sink.detail(1) == "ble-init-failed", "init failure: READER_OFFLINE");
        f.radio.initError = Error();
        f.request("BLE_SCAN", scanPayload(2));
        expect(f.radio.initCalls == 2 && f.radio.count("scan") == 1, "the next request tries again");
    }

    // ------------------------------------------------------------------------------------------- allowlist

    void allowlistIsEnforcedBeforeTheRadio()
    {
        Fixture f;
        f.open(23);
        const size_t before = f.radio.calls.size();
        f.request("BLE_READ", target("BLE_READ", 10, RW, "", "sess-other"));
        expect(f.sink.code(10) == "SESSION_CLOSED" && f.sink.detail(10) == "unknown-session", "unknown session");
        f.request("BLE_READ", target("BLE_READ", 11, OTHER));
        expect(f.sink.code(11) == "UNKNOWN_CHARACTERISTIC" && f.sink.detail(11) == "not-in-allowlist",
               "characteristic outside the allowlist");
        f.request("BLE_READ", target("BLE_READ", 12, EVENTS));
        expect(f.sink.code(12) == "OPERATION_NOT_ALLOWED", "read on a notify-only characteristic");
        f.request("BLE_WRITE", target("BLE_WRITE", 13, RW, ",\"value\":\"AAAAAAAAAAAA\""));
        expect(f.sink.code(13) == "PAYLOAD_TOO_LARGE", "write of 9 bytes above its bound of 8");
        f.request("BLE_WRITE", target("BLE_WRITE", 14, RW, ",\"value\":\"AAAA\",\"withoutResponse\":true"));
        expect(f.sink.code(14) == "OPERATION_NOT_ALLOWED", "write without response where only write is allowed");
        std::string bytes21;
        base64Encode(Bytes(21, 1).data(), 21, bytes21);
        f.request("BLE_WRITE", target("BLE_WRITE", 15, BULK, ",\"value\":\"" + bytes21 + "\",\"withoutResponse\":true"));
        expect(f.sink.code(15) == "PAYLOAD_TOO_LARGE" && f.sink.detail(15) == "exceeds-mtu",
               "write without response above MTU - 3");
        f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 16, EVENTS, ",\"indicate\":true"));
        expect(f.sink.code(16) == "OPERATION_NOT_ALLOWED", "indicate where only notify is allowed");
        expect(f.radio.calls.size() == before, "none of them reached the radio");

        std::string bytes20;
        base64Encode(Bytes(20, 1).data(), 20, bytes20);
        f.radio.starts.push_back(IBleRadio::Start::Done);
        f.request("BLE_WRITE", target("BLE_WRITE", 17, BULK, ",\"value\":\"" + bytes20 + "\",\"withoutResponse\":true"));
        expect(f.sink.code(17) == "OK" && f.radio.count("wwr") == 1, "MTU - 3 bytes fit");
    }

    void addressMismatchEndsTheSession()
    {
        Fixture f;
        f.request("BLE_SESSION_OPEN", openPayload(1));
        f.core.onConnected(address("AA:BB:CC:DD:EE:02"), 100, f.now);
        expect(f.sink.code(1) == "OPERATION_NOT_ALLOWED" && f.sink.detail(1) == "address-mismatch",
               "a link to another device is refused");
        expect(f.radio.count("disconnect") == 1, "and taken down");
        f.core.onDisconnected(0x213, f.now);
        expect(f.core.owner() == BleProxyCore::Owner::None, "the reader is free again");
    }

    void readAboveItsBoundIsRefused()
    {
        Fixture f;
        f.open();
        f.request("BLE_READ", target("BLE_READ", 2, RW));
        f.done(Error(), Bytes(17, 1));
        expect(f.sink.code(2) == "PAYLOAD_TOO_LARGE", "a read of 17 bytes above its bound of 16 is refused");
        f.request("BLE_READ", target("BLE_READ", 3, RW));
        f.done(Error(), Bytes{1, 2, 3});
        expect(f.sink.code(3) == "OK" && std::strcmp(f.sink.answer(3)["value"] | "", "AQID") == 0, "a fitting read");
    }

    // ------------------------------------------------------------------------------------------- deadlines

    void leaseHoldsWhenTheApiIsSilent()
    {
        Fixture f;
        f.open(247, 5000);
        f.advance(5000 + LEASE_GRACE_MS - 100);
        expect(f.radio.count("disconnect") == 0, "the lease runs with a 10 s grace");
        f.advance(200);
        expect(f.radio.count("disconnect") == 1, "then the reader disconnects on its own");
        f.core.onDisconnected(0x216, f.now);
        auto ended = f.sink.ofType("BLE_SESSION_ENDED");
        expect(ended.size() == 1 && std::strcmp(ended[0]["reason"] | "", "lease-expired") == 0, "and says why");
        expect(f.core.owner() == BleProxyCore::Owner::None, "the reader is free");
    }

    void operationDeadlineAnswersOnceAndKeepsOrder()
    {
        Fixture f;
        f.open();
        f.request("BLE_READ", target("BLE_READ", 2, RW));
        f.request("BLE_READ", target("BLE_READ", 3, RW, "", "sess-1", 30000));
        f.advance(1000 + OP_GRACE_MS + 100);
        expect(f.sink.code(2) == "TIMEOUT", "the op deadline (timeoutMs + grace) answers TIMEOUT");
        expect(f.radio.count("read") == 1, "the next read waits until NimBLE finished the first");
        f.done(Error(), Bytes{9});
        expect(f.sink.answers(2).size() == 1, "the late result is discarded");
        expect(f.radio.count("read") == 2, "then the queued read starts");
        f.done(Error(), Bytes{8});
        expect(f.sink.code(3) == "OK", "and completes");
    }

    void queuedRequestsTimeOutAndAreBounded()
    {
        Fixture f;
        f.open();
        for (uint32_t id = 10; id < 10 + MAX_PENDING_REQUESTS + 1; id++) f.request("BLE_READ", target("BLE_READ", id, RW, "", "sess-1", 60000));
        // One runs, sixteen wait; the eighteenth does not fit.
        f.request("BLE_READ", target("BLE_READ", 99, RW));
        expect(f.sink.code(99) == "READER_BUSY" && f.sink.detail(99) == "queue-full", "the request queue is bounded");
    }

    void stuckRadioDropsTheLink()
    {
        Fixture f;
        f.open();
        f.request("BLE_READ", target("BLE_READ", 2, RW));
        f.advance(STUCK_OP_MS + 100);
        expect(f.sink.code(2) == "TIMEOUT", "answered on its deadline");
        expect(f.radio.count("disconnect") == 1, "a procedure NimBLE never finishes ends the session");
    }

    void connectDeadline()
    {
        Fixture f;
        f.request("BLE_SESSION_OPEN", openPayload(1));
        f.advance(5000 + OP_GRACE_MS + 100);
        expect(f.sink.code(1) == "DEVICE_NOT_FOUND" && f.sink.detail(1) == "connect-timeout", "connect deadline");
        expect(f.radio.count("cancelConnect") == 1, "the connect is cancelled");
        f.core.onConnectFailed(Error(Code::Cancelled), f.now);
        expect(f.core.owner() == BleProxyCore::Owner::None, "the reader is free");
    }

    // ------------------------------------------------------------------------------------------- cancellation

    void cancelStopsScanAndConnect()
    {
        Fixture f;
        f.request("BLE_SCAN", scanPayload(1));
        f.request("BLE_CANCEL", "{\"v\":1,\"sessionId\":\"scan-1\",\"requestId\":1}");
        expect(f.sink.code(1) == "CANCELLED" && f.radio.count("stopScan") == 1, "a cancelled scan stops");
        expect(f.core.owner() == BleProxyCore::Owner::None, "and frees the reader");
        f.core.onScanComplete(f.now);
        expect(f.sink.answers(1).size() == 1, "a late scan-complete answers nothing");

        f.request("BLE_SESSION_OPEN", openPayload(2));
        f.request("BLE_CANCEL", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":2}");
        expect(f.sink.code(2) == "CANCELLED" && f.radio.count("cancelConnect") == 1, "a cancelled connect stops");
        expect(f.core.owner() == BleProxyCore::Owner::Session, "held until the controller confirmed");
        f.core.onConnected(address(ADDRESS), 247, f.now);
        expect(f.radio.count("disconnect") == 1, "a connect that won the race is taken down");
        f.core.onConnectFailed(Error(Code::Cancelled), f.now);
        expect(f.core.owner() == BleProxyCore::Owner::None, "then the reader is free");
        auto ended = f.sink.ofType("BLE_SESSION_ENDED");
        expect(ended.size() == 1 && std::strcmp(ended[0]["reason"] | "", "cancelled") == 0, "ended: cancelled");
        expect(f.sink.answers(2).size() == 1, "answered exactly once");
    }

    void cancelInFlightAndQueued()
    {
        Fixture f;
        f.open();
        f.request("BLE_READ", target("BLE_READ", 2, RW));
        f.request("BLE_READ", target("BLE_READ", 3, RW));
        f.request("BLE_READ", target("BLE_READ", 4, RW));
        f.request("BLE_CANCEL", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":3}");
        expect(f.sink.code(3) == "CANCELLED", "a queued request is removed");
        f.request("BLE_CANCEL", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":2}");
        expect(f.sink.code(2) == "CANCELLED", "an in-flight one is answered at once");
        expect(f.radio.count("read") == 1, "but the next one waits for NimBLE");
        f.done(Error(), Bytes{1});
        expect(f.sink.answers(2).size() == 1, "the late result is discarded");
        f.done(Error(), Bytes{2});
        expect(f.sink.code(4) == "OK", "the last read runs");
        expect(f.sink.answers(3).size() == 1, "every request settled exactly once");
        expect(f.core.owner() == BleProxyCore::Owner::Session, "a cancel never closes the session");
        f.request("BLE_CANCEL", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":4}");
        expect(f.sink.answers(4).size() == 1, "cancelling a finished request does nothing");
    }

    void cancelledSubscribeIsUndone()
    {
        Fixture f;
        f.open();
        f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, EVENTS));
        f.request("BLE_CANCEL", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":2}");
        f.done();
        expect(f.radio.count("cccd-off") == 1, "the CCCD written after the cancel is cleared again");
        f.done();
        expect(f.sink.answers(2).size() == 1 && f.sink.code(2) == "CANCELLED", "one answer");
        f.notifications.push(uuid(SVC), uuid(EVENTS), reinterpret_cast<const uint8_t *>("x"), 1);
        f.advance(100);
        expect(f.sink.ofType("BLE_NOTIFICATION").empty(), "nothing is forwarded for it");
    }

    void writeWithoutResponseRetriesOnFullBuffers()
    {
        Fixture f;
        f.open();
        f.radio.starts = {IBleRadio::Start::Retry, IBleRadio::Start::Retry, IBleRadio::Start::Done};
        f.request("BLE_WRITE", target("BLE_WRITE", 2, BULK, ",\"value\":\"AAAA\",\"withoutResponse\":true"));
        expect(f.sink.answers(2).empty(), "no answer while the controller buffers are full");
        f.advance(200);
        expect(f.sink.code(2) == "OK" && f.radio.count("wwr") == 3, "retried until it fit");
        f.radio.starts = {IBleRadio::Start::Retry};
        f.request("BLE_WRITE", target("BLE_WRITE", 3, BULK, ",\"value\":\"AAAA\",\"withoutResponse\":true"));
        for (int i = 0; i < 40; i++) f.radio.starts.push_back(IBleRadio::Start::Retry);
        f.advance(1000 + OP_GRACE_MS + 100);
        expect(f.sink.code(3) == "TIMEOUT", "but not past its deadline");
    }

    // ------------------------------------------------------------------------------------------- notifications

    void notificationsAreSequencedAndBounded()
    {
        Fixture f;
        f.open();
        f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, EVENTS));
        expect(f.radio.count("cccd-notify") == 1, "subscribe writes the CCCD");
        f.done();
        expect(f.sink.code(2) == "OK", "subscribed");
        const uint8_t one[] = {1};
        f.notifications.push(uuid(SVC), uuid(EVENTS), one, 1);
        f.notifications.push(uuid(SVC), uuid(EVENTS), one, 1);
        f.notifications.push(uuid(SVC), uuid(RW), one, 1); // not subscribed
        f.advance(100);
        auto n = f.sink.ofType("BLE_NOTIFICATION");
        expect(n.size() == 2, "only the subscribed characteristic is forwarded");
        expect(n[0]["seq"] == 1 && n[1]["seq"] == 2 && n[0]["subscriptionId"] == 2, "in order, seq from 1, per subscription");

        // Backpressure: the websocket is full, the buffer (4 entries / 64 bytes here) holds, then overflows.
        f.sink.room = false;
        for (int i = 0; i < 6; i++) f.notifications.push(uuid(SVC), uuid(EVENTS), one, 1);
        f.advance(100);
        expect(f.sink.ofType("BLE_NOTIFICATION").size() == 2, "nothing goes out without room");
        f.sink.room = true;
        f.advance(100);
        n = f.sink.ofType("BLE_NOTIFICATION");
        expect(n.size() == 2 + 4 + 1, "the buffered ones, then one overflow marker");
        expect(std::strcmp(n.back()["error"]["code"] | "", "NOTIFICATION_OVERFLOW") == 0 && n.back()["seq"] == 7,
               "the overflow is reported, never a silent gap");
        f.notifications.push(uuid(SVC), uuid(EVENTS), one, 1);
        f.advance(100);
        expect(f.sink.ofType("BLE_NOTIFICATION").size() == 7, "nothing after the stream failed");

        // A new subscription delivers again, from seq 1.
        f.request("BLE_UNSUBSCRIBE", target("BLE_UNSUBSCRIBE", 3, EVENTS));
        f.done();
        f.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 4, EVENTS));
        f.done();
        const uint8_t nine[9] = {};
        f.notifications.push(uuid(SVC), uuid(EVENTS), nine, sizeof nine);
        f.advance(100);
        n = f.sink.ofType("BLE_NOTIFICATION");
        expect(n.back()["subscriptionId"] == 4 && n.back()["seq"] == 1 &&
                   std::strcmp(n.back()["error"]["code"] | "", "PAYLOAD_TOO_LARGE") == 0,
               "a notification above its bound fails the stream with PAYLOAD_TOO_LARGE");
    }

    // ------------------------------------------------------------------------------------------- lifecycle

    void closeAnswersAfterTheLinkIsDown()
    {
        Fixture f;
        f.open();
        f.request("BLE_READ", target("BLE_READ", 2, RW));
        f.request("BLE_READ", target("BLE_READ", 3, RW));
        f.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":4}");
        expect(f.sink.code(2) == "SESSION_CLOSED" && f.sink.code(3) == "SESSION_CLOSED", "outstanding work ends");
        expect(f.sink.answers(4).empty() && f.radio.count("disconnect") == 1, "the close waits for the disconnect");
        f.request("BLE_SESSION_OPEN", openPayload(5, "sess-2"));
        expect(f.sink.code(5) == "READER_BUSY", "no new owner before the link is down");
        f.core.onDisconnected(0x216, f.now);
        expect(f.sink.code(4) == "OK", "then the close is answered");
        auto ended = f.sink.ofType("BLE_SESSION_ENDED");
        expect(ended.size() == 1 && std::strcmp(ended[0]["reason"] | "", "closed") == 0, "and the session ended");
        f.done(Error(), Bytes{1});
        expect(f.sink.answers(2).size() == 1, "a late radio result touches nothing");
    }

    void closeWithoutControllerConfirmationStillReleases()
    {
        Fixture f;
        f.open();
        f.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":4}");
        f.advance(RELEASE_DEADLINE_MS + 100);
        expect(f.sink.code(4) == "OK" && f.core.owner() == BleProxyCore::Owner::None, "the release deadline frees it");
    }

    void peripheralLossFailsPendingWork()
    {
        Fixture f;
        f.open();
        f.request("BLE_READ", target("BLE_READ", 2, RW));
        f.request("BLE_READ", target("BLE_READ", 3, RW));
        f.done(Error(Code::Disconnected, "link-lost"));
        f.core.onDisconnected(nimble::ERR_HCI_BASE + nimble::HCI_CONN_SPVN_TMO, f.now);
        expect(f.sink.code(2) == "DISCONNECTED" && f.sink.code(3) == "DISCONNECTED", "pending calls: DISCONNECTED");
        auto ended = f.sink.ofType("BLE_SESSION_ENDED");
        expect(ended.size() == 1 && std::strcmp(ended[0]["reason"] | "", "disconnected") == 0 &&
                   std::strcmp(ended[0]["detail"] | "", "reason:0x08") == 0,
               "ended: disconnected, with the HCI reason");
        expect(f.core.owner() == BleProxyCore::Owner::None && f.radio.count("disconnect") == 0, "free, no extra disconnect");
    }

    void linkLossEndsEverythingSilently()
    {
        Fixture f;
        f.open();
        f.request("BLE_READ", target("BLE_READ", 2, RW));
        f.sink.accept = false;
        f.request("BLE_READ", target("BLE_READ", 9, OTHER)); // its answer waits in the outbox
        const size_t sent = f.sink.messages.size();
        f.core.linkLost(f.now);
        f.sink.accept = true;
        f.advance(100);
        expect(f.radio.count("disconnect") == 1, "the peripheral is disconnected at once");
        expect(f.sink.messages.size() == sent, "nothing goes to the next connection, not even queued answers");
        f.core.onDisconnected(0x216, f.now);
        expect(f.core.owner() == BleProxyCore::Owner::None, "the reader is free for the next connection");
        expect(f.sink.messages.size() == sent, "still silent");

        Fixture g;
        g.request("BLE_SCAN", scanPayload(1));
        g.core.linkLost(g.now);
        expect(g.radio.count("stopScan") == 1 && g.core.owner() == BleProxyCore::Owner::None, "a scan stops too");
    }

    void otaRefusesAndEnds()
    {
        Fixture f;
        f.open();
        f.ota = true;
        f.core.otaStarted(f.now);
        expect(f.radio.count("disconnect") == 1, "OTA ends the session");
        f.core.onDisconnected(0x216, f.now);
        auto ended = f.sink.ofType("BLE_SESSION_ENDED");
        expect(ended.size() == 1 && std::strcmp(ended[0]["reason"] | "", "ota") == 0, "ended: ota");
        f.request("BLE_SCAN", scanPayload(7));
        expect(f.sink.code(7) == "READER_BUSY" && f.sink.detail(7) == "ota", "no BLE work during OTA");
        f.request("BLE_SESSION_OPEN", openPayload(8, "sess-9"));
        expect(f.sink.code(8) == "READER_BUSY" && f.radio.count("connect") == 1, "not even a connect");
    }

    // ------------------------------------------------------------------------------------------- scan

    void scanDeduplicatesFiltersAndBounds()
    {
        Fixture f;
        f.request("BLE_SCAN", scanPayload(1));
        // AD: flags, 16-bit UUID fff0, complete name "Demo lock".
        const uint8_t adv[] = {2, 0x01, 0x06, 3, 0x03, 0xf0, 0xff};
        const uint8_t rsp[] = {10, 0x09, 'D', 'e', 'm', 'o', ' ', 'l', 'o', 'c', 'k', 5, 0xff, 0x34, 0x12, 0xaa, 0xbb};
        f.core.onAdvertisement(address("AA:BB:CC:DD:EE:01"), -50, true, adv, sizeof adv);
        f.core.onAdvertisement(address("AA:BB:CC:DD:EE:01"), -48, true, rsp, sizeof rsp);
        f.core.onAdvertisement(address("AA:BB:CC:DD:EE:02"), -60, true, adv, sizeof adv); // no name: no match
        const uint8_t named[] = {3, 0x03, 0xf0, 0xff, 5, 0x09, 'D', 'e', 'm', 'o'};
        f.core.onAdvertisement(address("AA:BB:CC:DD:EE:03"), -70, true, named, sizeof named);
        f.core.onAdvertisement(address("AA:BB:CC:DD:EE:04"), -70, true, named, sizeof named);
        f.core.onScanComplete(f.now);
        JsonObjectConst result = f.sink.answer(1);
        JsonArrayConst ads = result["advertisements"].as<JsonArrayConst>();
        expect(ads.size() == 2, "matching advertisements up to maxResults");
        expect(std::strcmp(ads[0]["address"] | "", "AA:BB:CC:DD:EE:01") == 0 && ads[0]["rssi"] == -48 &&
                   std::strcmp(ads[0]["name"] | "", "Demo lock") == 0,
               "advertising data and scan response are merged per address");
        expect(std::strcmp(ads[0]["serviceUuids"][0] | "", SVC) == 0, "UUIDs go out as 128-bit");
        expect(ads[0]["manufacturerData"][0]["companyId"] == 0x1234 &&
                   std::strcmp(ads[0]["manufacturerData"][0]["data"] | "", "qrs=") == 0,
               "manufacturer data keeps its company id");
    }

    // Found on hardware: in a crowded band the candidate list filled with other devices before the wanted one.
    void crowdedBandKeepsRoomForMatches()
    {
        Fixture f;
        f.request("BLE_SCAN", scanPayload(1));
        const uint8_t other[] = {3, 0x03, 0x0f, 0x18}; // battery service only: ruled out by the filter
        for (unsigned i = 0; i < MAX_SCAN_CANDIDATES + 10; i++)
        {
            char text[18];
            std::snprintf(text, sizeof text, "10:00:00:00:%02X:%02X", (i >> 8) & 0xff, i & 0xff);
            f.core.onAdvertisement(address(text), -80, true, other, sizeof other);
        }
        const uint8_t named[] = {3, 0x03, 0xf0, 0xff, 5, 0x09, 'D', 'e', 'm', 'o'};
        f.core.onAdvertisement(address("AA:BB:CC:DD:EE:09"), -60, true, named, sizeof named);
        f.core.onScanComplete(f.now);
        JsonArrayConst ads = f.sink.answer(1)["advertisements"].as<JsonArrayConst>();
        expect(ads.size() == 1 && std::strcmp(ads[0]["address"] | "", "AA:BB:CC:DD:EE:09") == 0,
               "a matching device still gets a slot when the list is full of devices the filter rules out");
    }

    void advertisingParserSurvivesGarbage()
    {
        Advertisement ad;
        const uint8_t truncated[] = {5, 0x09, 'a'};
        mergeAdvertisingData(truncated, sizeof truncated, ad);
        expect(ad.name.empty(), "a truncated structure is ignored");
        uint8_t uuid128[18] = {17, 0x07};
        for (int i = 0; i < 16; i++) uuid128[2 + i] = static_cast<uint8_t>(i);
        mergeAdvertisingData(uuid128, sizeof uuid128, ad);
        char text[37];
        formatUuid(ad.serviceUuids.at(0), text);
        expect(std::strcmp(text, "0f0e0d0c-0b0a-0908-0706-050403020100") == 0, "128-bit UUIDs are reversed from air order");
    }

    // ------------------------------------------------------------------------------------------- mapping

    void errorMapping()
    {
        expect(mapConnectFailure(nimble::HS_ETIMEOUT).code == Code::DeviceNotFound, "connect timeout: DEVICE_NOT_FOUND");
        Error e = mapConnectFailure(nimble::ERR_HCI_BASE + nimble::HCI_CONN_ESTABLISHMENT);
        expect(e.code == Code::ConnectionFailed && std::strcmp(e.detail, "hci:0x3e") == 0, "0x3E: CONNECTION_FAILED hci:0x3e");
        expect(mapConnectFailure(12).code == Code::ConnectionFailed, "other connect failures: CONNECTION_FAILED");
        e = mapGattStatus(nimble::ERR_ATT_BASE + 0x0e);
        expect(e.code == Code::GattError && std::strcmp(e.detail, "att:0x0e") == 0, "ATT error: GATT_ERROR att:0x0e");
        expect(mapGattStatus(nimble::HS_ETIMEOUT).code == Code::Timeout, "NimBLE timeout: TIMEOUT");
        expect(mapGattStatus(nimble::HS_ENOTCONN).code == Code::Disconnected, "not connected: DISCONNECTED");
        e = mapGattStatus(3);
        expect(e.code == Code::Internal && std::strcmp(e.detail, "nimble:rc=3") == 0, "anything else: INTERNAL nimble:rc");
        expect(mapGattStatus(0).ok(), "0 is success");
        char detail[40];
        disconnectDetail(nimble::ERR_HCI_BASE + 0x13, detail, sizeof detail);
        expect(std::strcmp(detail, "reason:0x13") == 0, "disconnect reason");
    }

    void capabilityFitsTheFirmwareInfo()
    {
        JsonDocument event;
        ui::VariantTraits traits{true, true, true, true, true, 480, 480};
        char uiCaps[ui::CAPABILITIES_UI_SCRATCH];
        ui::buildFirmwareInfo(event, {"attractap_touch_v2", "attractap-touch-v2", "2.2.0", "POWERON", 4294967295u},
                              traits, uiCaps, sizeof uiCaps);
        event["data"]["payload"]["capabilities"]["cardRelay"] = true;
        char bleCaps[CAPABILITY_SCRATCH];
        fillCapability(event["data"]["payload"]["capabilities"], bleCaps, sizeof bleCaps);
        std::string json;
        serializeJson(event, json);
        // api.hpp JSON_OUTBUF_AUTH (1536) must hold the whole message.
        std::printf("READER_FIRMWARE_INFO: %u bytes\n", static_cast<unsigned>(json.size()));
        expect(json.size() < 1536, "the firmware info fits JSON_OUTBUF_AUTH");
        expect(std::strlen(bleCaps) < CAPABILITY_SCRATCH - 1, "the ble block fits its scratch");
        JsonDocument back;
        deserializeJson(back, json);
        JsonObjectConst ble = back["data"]["payload"]["capabilities"]["ble"];
        expect(ble["version"] == 1 && ble["maxMtu"] == 517 && ble["maxPayloadBytes"] == 512 &&
                   ble["operations"].size() == 8 && ble["maxConnections"] == 1,
               "capabilities.ble v1 as the API expects");
    }
}

int main()
{
    codecRoundTripsAndBoundsBase64();
    codecParsesAndRefuses();
    oneOwnerAtATime();
    initFailureIsReportedNotFatal();
    allowlistIsEnforcedBeforeTheRadio();
    addressMismatchEndsTheSession();
    readAboveItsBoundIsRefused();
    leaseHoldsWhenTheApiIsSilent();
    operationDeadlineAnswersOnceAndKeepsOrder();
    queuedRequestsTimeOutAndAreBounded();
    stuckRadioDropsTheLink();
    connectDeadline();
    cancelStopsScanAndConnect();
    cancelInFlightAndQueued();
    cancelledSubscribeIsUndone();
    writeWithoutResponseRetriesOnFullBuffers();
    notificationsAreSequencedAndBounded();
    closeAnswersAfterTheLinkIsDown();
    closeWithoutControllerConfirmationStillReleases();
    peripheralLossFailsPendingWork();
    linkLossEndsEverythingSilently();
    otaRefusesAndEnds();
    scanDeduplicatesFiltersAndBounds();
    crowdedBandKeepsRoomForMatches();
    advertisingParserSurvivesGarbage();
    errorMapping();
    capabilityFitsTheFirmwareInfo();
    runEdgeTests();
    runLinkTests();
    std::puts("PASS ble proxy");
}
