// The stack's lifetime: it comes up on a request and shuts down once nothing used it for STACK_IDLE_SHUTDOWN_MS, so
// the controller's internal RAM goes back to the heap between a lock's exchanges. Nothing that still needs the
// radio or still has to go out may lose it, and the next request must find a working stack again.
#include "ble_test_support.hpp"

namespace bletest
{
    namespace
    {
        bool logged(const Fixture &f, const char *text)
        {
            for (const std::string &line : f.sink.logs)
                if (line.find(text) != std::string::npos) return true;
            return false;
        }

        // A scan that ends on its own deadline, then nothing.
        void scanAndFinish(Fixture &f, uint32_t requestId)
        {
            f.request("BLE_SCAN", scanPayload(requestId, "scan-1", 3000));
            f.advance(3000);
            expect(f.sink.code(requestId) == "OK", "the scan finishes");
        }

        void shutsDownAfterTheIdlePeriod()
        {
            Fixture f;
            f.advance(2 * STACK_IDLE_SHUTDOWN_MS);
            expect(f.radio.initCalls == 0 && f.radio.count("shutdown") == 0, "nothing starts or stops at boot");

            scanAndFinish(f, 1);
            expect(f.core.radioReady() && f.core.idle(), "the stack stays up after the work");
            const uint32_t left = f.core.shutdownInMs(f.now);
            expect(left > STACK_IDLE_SHUTDOWN_MS - 300 && left <= STACK_IDLE_SHUTDOWN_MS,
                   "the idle period counts from the end of the work, and the proxy task sleeps that long");
            f.advance(STACK_IDLE_SHUTDOWN_MS - 300);
            expect(f.radio.count("shutdown") == 0 && f.core.radioReady(), "not before the idle period");
            f.advance(400);
            expect(f.radio.count("shutdown") == 1 && !f.core.radioReady(), "the idle stack shuts down");
            expect(logged(f, "ble stack shut down after"), "and logs it");
            f.advance(2 * STACK_IDLE_SHUTDOWN_MS);
            expect(f.radio.count("shutdown") == 1, "once");
        }

        void nothingPendingIsCutOff()
        {
            // An open session keeps the stack, however long it is quiet.
            Fixture f;
            f.open(247, 900000);
            f.advance(3 * STACK_IDLE_SHUTDOWN_MS);
            expect(f.radio.count("shutdown") == 0, "an open session holds the stack");

            // A close the controller has not confirmed yet: the link may still be up.
            f.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":2}");
            f.advance(RELEASE_DEADLINE_MS - 200);
            expect(f.radio.count("shutdown") == 0 && f.core.owner() == BleProxyCore::Owner::Session,
                   "a session waiting for its disconnect holds the stack");
            f.core.onDisconnected(0x16, f.now);
            expect(f.sink.code(2) == "OK", "the close is answered once the link is down");
            f.advance(STACK_IDLE_SHUTDOWN_MS + 200);
            expect(f.radio.count("shutdown") == 1, "and the stack shuts down an idle period later");

            // Answers the websocket did not take yet: the proxy is not idle, so the stack stays too.
            Fixture g;
            g.open(247, 900000);
            g.sink.accept = false;
            g.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":2}");
            g.core.onDisconnected(0x16, g.now);
            g.advance(2 * STACK_IDLE_SHUTDOWN_MS);
            expect(!g.core.idle() && g.radio.count("shutdown") == 0, "undelivered answers hold the stack");
            g.sink.accept = true;
            g.advance(100);
            expect(g.core.idle() && g.sink.code(2) == "OK", "they go out once the websocket takes them");
            g.advance(STACK_IDLE_SHUTDOWN_MS - 300);
            expect(g.radio.count("shutdown") == 0, "the idle period starts only then");
            g.advance(400);
            expect(g.radio.count("shutdown") == 1, "and then the stack shuts down");

            // Undelivered notifications of an open session.
            Fixture h;
            h.open(247, 900000);
            h.request("BLE_SUBSCRIBE", target("BLE_SUBSCRIBE", 2, EVENTS));
            h.done();
            const Uuid service = uuid(SVC), events = uuid(EVENTS);
            const uint8_t value[] = {1, 2, 3};
            h.sink.room = false;
            h.notifications.push(service, events, value, sizeof value);
            h.advance(2 * STACK_IDLE_SHUTDOWN_MS);
            expect(h.notifications.size() == 1 && h.radio.count("shutdown") == 0,
                   "buffered notifications (and their session) hold the stack");

            // Work that keeps arriving restarts the idle period every time.
            Fixture k;
            for (uint32_t i = 1; i <= 4; i++)
            {
                scanAndFinish(k, i);
                k.advance(STACK_IDLE_SHUTDOWN_MS - 5000);
            }
            expect(k.radio.count("shutdown") == 0 && k.radio.initCalls == 1,
                   "back-to-back exchanges keep one stack");
        }

        void controllerWorkWithoutAnOwnerHoldsTheStack()
        {
            // The core gave up waiting for a disconnect (its release deadline) while the controller keeps the link.
            Fixture f;
            f.open(247, 900000);
            f.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":2}");
            f.radio.controllerActive = true;
            f.advance(RELEASE_DEADLINE_MS + 200);
            expect(f.core.owner() == BleProxyCore::Owner::None && f.sink.code(2) == "OK", "the owner is released");
            f.advance(3 * STACK_IDLE_SHUTDOWN_MS);
            expect(f.radio.count("shutdown") == 0, "a link the controller still holds keeps the stack");
            f.radio.controllerActive = false;
            f.advance(STACK_IDLE_SHUTDOWN_MS - 300);
            expect(f.radio.count("shutdown") == 0, "the idle period counts from the last time the controller was busy");
            f.advance(400);
            expect(f.radio.count("shutdown") == 1, "and the stack goes once the link is down");
        }

        void nextRequestBringsAFreshStack()
        {
            Fixture f;
            scanAndFinish(f, 10);
            f.advance(STACK_IDLE_SHUTDOWN_MS + 200);
            expect(f.radio.count("shutdown") == 1, "the stack is down");
            f.open();
            expect(f.radio.initCalls == 2, "the next request brings it up again");
            const auto &calls = f.radio.calls;
            const auto down = std::find(calls.begin(), calls.end(), "shutdown");
            expect(std::find(down, calls.end(), "init") < std::find(down, calls.end(), "connect"),
                   "before anything reaches the radio");
            f.request("BLE_READ", target("BLE_READ", 2, RW));
            f.done(Error(), Bytes{1, 2});
            expect(f.sink.code(2) == "OK", "and the session works on it");
            f.request("BLE_SESSION_CLOSE", "{\"v\":1,\"sessionId\":\"sess-1\",\"requestId\":3}");
            f.core.onDisconnected(0x16, f.now);
            f.advance(STACK_IDLE_SHUTDOWN_MS + 200);
            expect(f.radio.count("shutdown") == 2, "the fresh stack shuts down after its own idle period");
        }

        void requestDuringShutdownGetsAFreshStack()
        {
            Fixture f;
            scanAndFinish(f, 1);
            // The proxy task is inside shutdown() when the request arrives: it waits in the command queue.
            std::vector<Command> queue;
            bool readyDuringShutdown = true;
            f.radio.duringShutdown = [&] {
                readyDuringShutdown = f.core.radioReady();
                queue.push_back(make("BLE_SCAN", scanPayload(2, "scan-2", 3000), f.now));
            };
            f.advance(STACK_IDLE_SHUTDOWN_MS + 200);
            expect(!readyDuringShutdown, "the stack counts as down before it starts going down");
            expect(queue.size() == 1 && f.sink.answers(2).empty(), "the request is not lost, nor answered early");
            f.core.handle(std::move(queue.front()), f.now);
            expect(f.radio.initCalls == 2 && f.radio.count("scan") == 2, "it brings a fresh stack up and runs on it");
            expect(f.radio.calls.back() == "scan" && f.radio.calls[f.radio.calls.size() - 2] == "init",
                   "init comes after the shutdown, before the scan");
            f.advance(3000);
            expect(f.sink.code(2) == "OK", "and is answered once");
        }

        void initFailureAfterShutdownCanBeRetried()
        {
            Fixture f;
            scanAndFinish(f, 1);
            f.advance(STACK_IDLE_SHUTDOWN_MS + 200);
            f.radio.initError = Error(Code::ReaderOffline, "no-sync");
            f.request("BLE_SESSION_OPEN", openPayload(2));
            expect(f.sink.code(2) == "READER_OFFLINE" && f.sink.detail(2) == "ble-init-failed",
                   "a failed init after a shutdown is answered like the first one");
            expect(f.radio.count("connect") == 0, "nothing reaches the radio");
            f.advance(2 * STACK_IDLE_SHUTDOWN_MS);
            expect(f.radio.count("shutdown") == 1, "a stack that is not up is not shut down");
            f.radio.initError = Error();
            f.request("BLE_SESSION_OPEN", openPayload(3));
            f.core.onConnected(address(ADDRESS), 247, f.now);
            expect(f.radio.initCalls == 3 && f.sink.code(3) == "OK", "the next request tries again and works");
        }

        void failedShutdownIsRetriedThroughInit()
        {
            Fixture f;
            f.radio.shutdownError = Error(Code::Internal, "nimble:rc=2");
            scanAndFinish(f, 1);
            f.advance(STACK_IDLE_SHUTDOWN_MS + 200);
            expect(logged(f, "ble shutdown failed detail=nimble:rc=2"), "a failed shutdown is logged");
            expect(!f.core.radioReady(), "the next request still goes through init");
            f.radio.shutdownError = Error();
            f.request("BLE_SCAN", scanPayload(2, "scan-2", 3000));
            expect(f.radio.initCalls == 2 && f.radio.count("scan") == 2, "which takes the stack as it is");
            f.advance(3000 + STACK_IDLE_SHUTDOWN_MS + 200);
            expect(f.radio.count("shutdown") == 2, "and the next idle period tries the shutdown again");
        }
    }

    void runStackTests()
    {
        shutsDownAfterTheIdlePeriod();
        nothingPendingIsCutOff();
        controllerWorkWithoutAnOwnerHoldsTheStack();
        nextRequestBringsAFreshStack();
        requestDuringShutdownGetsAFreshStack();
        initFailureAfterShutdownCanBeRetried();
        failedShutdownIsRetriedThroughInit();
    }
}
