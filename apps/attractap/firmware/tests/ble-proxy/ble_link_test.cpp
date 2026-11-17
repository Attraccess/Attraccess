// The link the reader asks for (ATT-1296) and the wakeup on a freed websocket send slot. The NimBLE calls themselves
// (connect parameters, data length, PHY) are not reachable from the host: the state machine never sees them, so a
// peripheral that refuses or changes them leaves the session as it is (covered by the tests that open sessions).
#include "ble_link.hpp"
#include "ble_room_waiter.hpp"
#include "ble_test_support.hpp"

namespace bletest
{
    namespace
    {
        void linkRequestStaysWithinTheSpec()
        {
            expect(link::INTERVAL_MIN * 125 / 100 >= 15 && link::INTERVAL_MAX * 125 / 100 <= 30,
                   "the reader asks for an interval within 15..30 ms");
            expect(link::valid(link::INTERVAL_MIN, link::INTERVAL_MAX, link::LATENCY, link::SUPERVISION_TIMEOUT),
                   "the requested parameters are valid");
            expect(!link::valid(24, 24, 0, 5), "a timeout shorter than two intervals is not");
            expect(!link::valid(24, 12, 0, 256), "nor is an inverted interval range");
            expect(link::DATA_LENGTH_OCTETS == 251, "the largest LE data length");
        }

        void linkLogLineCarriesOnlyTheParameters()
        {
            char line[96];
            LinkState state;
            state.interval = 13;
            state.latency = 0;
            state.timeout = 256;
            state.txOctets = 251;
            state.rxOctets = 27;
            state.txPhy = 2;
            state.rxPhy = 1;
            formatLink(line, sizeof line, state);
            expect(std::strcmp(line, "interval=16.25ms latency=0 timeout=2560ms data=tx251/rx27 phy=tx2/rx1") == 0,
                   "the negotiated link in one line");
            LinkState fallback;
            formatLink(line, sizeof line, fallback);
            expect(std::strstr(line, "data=tx27/rx27 phy=tx1/rx1") != nullptr,
                   "without DLE and 2M the defaults of the base spec");
        }

        void freedSlotsWakeOnlyAWaitingProxy()
        {
            RoomWaiter room;
            expect(!room.slotFreed(), "a reader without BLE work is never woken by websocket traffic");
            expect(room.attempt([] { return true; }) && !room.slotFreed(), "nor after a send that was taken");
            expect(!room.attempt([] { return false; }), "a refused send");
            expect(room.slotFreed(), "wakes the proxy on the next freed slot");
            expect(!room.slotFreed(), "once");
            bool freedDuringAttempt = false;
            room.attempt([&] {
                freedDuringAttempt = room.slotFreed(); // the send task frees a slot while the attempt fails
                return false;
            });
            expect(freedDuringAttempt, "a slot freed during a failing attempt is not lost");
        }

        void sessionEndLogsRetriesAndQueuedAnswers()
        {
            Fixture f;
            f.open();
            f.radio.starts = {IBleRadio::Start::Retry, IBleRadio::Start::Retry, IBleRadio::Start::Done};
            f.request("BLE_WRITE", target("BLE_WRITE", 2, BULK, ",\"value\":\"AAAA\",\"withoutResponse\":true"));
            f.sink.accept = false;
            f.advance(200);
            f.sink.accept = true;
            f.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":3}");
            bool logged = false;
            for (const std::string &line : f.sink.logs)
                logged |= line.find("ended reason=closed") != std::string::npos &&
                          line.find("retries=2 queued=1") != std::string::npos;
            expect(logged, "the session end reports write retries and answers that waited for room");
        }
    }

    void runLinkTests()
    {
        linkRequestStaysWithinTheSpec();
        linkLogLineCarriesOnlyTheParameters();
        freedSlotsWakeOnlyAWaitingProxy();
        sessionEndLogsRetriesAndQueuedAnswers();
    }
}
