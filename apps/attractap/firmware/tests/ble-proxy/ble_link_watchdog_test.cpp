// A connect or link whose NimBLE event never comes (ATT-1315): QA on the BLE bridge saw a cancelled connect whose
// connection complete event never arrived, and every later connect was refused link-busy for hours. The watchdog's
// timeline, then the QA sequence through the state machine, with a radio that behaves like NimbleRadio on that
// controller: events are posted and dropped when they belong to an earlier link, like the proxy task does.
#include "ble_link_watchdog.hpp"
#include "ble_test_support.hpp"

namespace bletest
{
    namespace
    {
        using Action = LinkWatchdog::Action;
        constexpr uint32_t GRACE = LinkWatchdog::EVENT_GRACE_MS;

        void eventOnTimeNeedsNothing()
        {
            LinkWatchdog dog;
            expect(!dog.armed() && dog.check(0, true) == Action::None, "nothing to watch before a procedure starts");
            dog.expect(0, 15000);
            expect(dog.check(15000 + GRACE - 1, true) == Action::None, "the event may come until its grace runs out");
            dog.settled();
            expect(!dog.armed() && dog.check(60000, true) == Action::None, "an event that came settles it");
        }

        void lostEventIsForgotten()
        {
            LinkWatchdog dog;
            dog.expect(0, 15000);
            expect(dog.check(15000 + GRACE, false) == Action::Forget,
                   "NimBLE no longer runs the connect: its event was lost, the radio forgets it");
            expect(!dog.armed(), "and nothing is owed any more");
        }

        void stuckProcedureIsRetriedThenTheControllerReset()
        {
            LinkWatchdog dog;
            dog.expect(0, 15000);
            const uint32_t due = 15000 + GRACE;
            expect(dog.check(due, true) == Action::Retry, "first the cancel or terminate is asked again");
            expect(dog.check(due + GRACE - 1, true) == Action::None, "with time for its event");
            expect(dog.check(due + GRACE, true) == Action::Reset, "then the controller is reset");
            const uint32_t reset = due + GRACE;
            expect(dog.check(reset + LinkWatchdog::RESET_WAIT_MS - 1, true) == Action::None, "the reset gets its time");
            expect(dog.check(reset + LinkWatchdog::RESET_WAIT_MS, true) == Action::Reset, "and is repeated if it did nothing");
            expect(dog.check(reset + 2 * LinkWatchdog::RESET_WAIT_MS, false) == Action::Forget,
                   "once NimBLE dropped the procedure without its event, the radio forgets it");
        }

        void askingAgainNeverPostponesTheRecovery()
        {
            LinkWatchdog dog;
            dog.expect(0, 15000);
            dog.expect(1000, 0); // the core cancelled the connect: its end is due sooner
            expect(dog.check(1000 + GRACE, true) == Action::Retry, "a cancel brings the deadline forward");
            LinkWatchdog terminate;
            terminate.expect(0, 2560);
            terminate.expect(2000, 2560); // the radio terminates again (a connect refused link-busy)
            expect(terminate.check(2560 + GRACE, true) == Action::Retry, "a second terminate keeps the first deadline");
        }

        void deadlinesSurviveTheClockWrapping()
        {
            LinkWatchdog dog;
            const uint32_t start = 0xFFFFFFFFu - 500;
            dog.expect(start, 0);
            expect(dog.check(start + GRACE - 1, true) == Action::None, "not due across the wrap");
            expect(dog.check(start + GRACE, false) == Action::Forget, "due across the wrap");
        }

        // NimbleRadio on the classic ESP32 controller, reduced to the connect: a cancel is acknowledged but the
        // connection complete event never comes, until the controller is reset (NimBLE then fails the connect).
        struct StuckController
        {
            Fixture &f;
            LinkWatchdog dog;
            bool connecting = false;    // the radio's view
            bool initiating = false;    // NimBLE's (ble_gap_conn_active)
            bool answersCancel = false; // a controller that sends its events (the S3's): NimBLE's timeout ends a connect
            uint32_t connectEnds = 0;
            uint32_t epoch = 0;
            int resets = 0;
            struct Posted
            {
                uint32_t epoch;
                Error error;
            };
            std::vector<Posted> queue;

            explicit StuckController(Fixture &fixture) : f(fixture)
            {
                f.radio.onConnect = [this](uint32_t timeoutMs)
                {
                    if (connecting) return Error(Code::ReaderBusy, "link-busy");
                    connecting = initiating = true;
                    connectEnds = f.now + timeoutMs;
                    epoch++;
                    dog.expect(f.now, timeoutMs);
                    return Error();
                };
                f.radio.onCancelConnect = [this]()
                {
                    dog.expect(f.now, 0);
                    if (!answersCancel) return;
                    initiating = false;
                    connectFailed(Error(Code::Cancelled));
                };
                f.radio.onSupervise = [this]() -> const char *
                {
                    switch (dog.check(f.now, connecting && initiating))
                    {
                    case Action::Forget:
                        if (!connecting) return nullptr;
                        connectFailed(Error(Code::Cancelled));
                        return "forget-connect";
                    case Action::Retry:
                        return "cancel-again"; // ignored like the first one
                    case Action::Reset:
                        resets++;
                        initiating = false; // NimBLE fails the connect procedure with an event
                        connectFailed(Error(Code::DeviceNotFound, "connect-timeout"));
                        return "reset-controller connect";
                    default:
                        return nullptr;
                    }
                };
            }

            void connectFailed(const Error &error)
            {
                connecting = false;
                dog.settled();
                queue.push_back({epoch, error});
            }

            // The proxy task's round: posted events first (those of an earlier link dropped), then the tick.
            void run(uint32_t ms)
            {
                for (uint32_t step = 0; step < ms; step += 100)
                {
                    f.now += 100;
                    if (answersCancel && initiating && f.now >= connectEnds)
                    {
                        initiating = false;
                        connectFailed(Error(Code::DeviceNotFound, "connect-timeout"));
                    }
                    deliver();
                    f.core.tick(f.now);
                }
                deliver();
            }

            void deliver()
            {
                std::vector<Posted> due;
                due.swap(queue);
                for (const Posted &event : due)
                    if (event.epoch == epoch) f.core.onConnectFailed(event.error, f.now);
            }

            bool logged(const char *text) const
            {
                for (const std::string &line : f.sink.logs)
                    if (line.find(text) != std::string::npos) return true;
                return false;
            }
        };

        void connectTimeoutWithoutItsEventRecovers()
        {
            Fixture f;
            StuckController radio(f);
            f.request("BLE_SESSION_OPEN", openPayload(1, "sess-1"));
            // The peripheral never answers; the core gives up (its deadline) and cancels; no event ever comes.
            radio.run(5000 + OP_GRACE_MS);
            expect(f.sink.code(1) == "DEVICE_NOT_FOUND", "the open times out");
            expect(f.radio.count("cancelConnect") == 1, "and the connect is cancelled");

            // Opened again within seconds: the radio still waits for the cancelled connect's event.
            radio.run(1000);
            f.request("BLE_SESSION_OPEN", openPayload(2, "sess-2"));
            expect(f.sink.code(2) == "READER_BUSY", "refused while the cancel may still complete");

            // The core releases the session on its own deadline; the radio's watchdog resets the controller.
            radio.run(RELEASE_DEADLINE_MS);
            expect(radio.resets == 1 && !radio.connecting, "the controller was reset once, the connect is over");
            expect(radio.logged("ble link recovery action=cancel-again") &&
                       radio.logged("ble link recovery action=reset-controller connect"),
                   "the recovery is logged");
            expect(f.core.owner() == BleProxyCore::Owner::None, "the radio is free");

            f.request("BLE_SESSION_OPEN", openPayload(3, "sess-3"));
            expect(f.sink.answers(3).empty() && f.core.owner() == BleProxyCore::Owner::Session,
                   "the next open connects instead of link-busy");
            f.core.onConnected(address(ADDRESS), 247, f.now);
            expect(f.sink.code(3) == "OK", "and the session opens");
        }

        void lostEventIsForgottenBeforeTheNextConnect()
        {
            Fixture f;
            StuckController radio(f);
            f.request("BLE_SESSION_OPEN", openPayload(1, "sess-1"));
            radio.run(5000 + OP_GRACE_MS);
            // NimBLE ended the connect, but its event never reached the radio.
            radio.initiating = false;
            radio.run(RELEASE_DEADLINE_MS);
            expect(radio.resets == 0, "nothing to reset: NimBLE runs nothing");
            expect(radio.logged("ble link recovery action=forget-connect"), "the lost event is forgotten");
            f.request("BLE_SESSION_OPEN", openPayload(2, "sess-2"));
            expect(f.sink.answers(2).empty() && f.core.owner() == BleProxyCore::Owner::Session, "the next open connects");
        }

        void connectRecoversBeforeItIsRefused()
        {
            Fixture f;
            StuckController radio(f);
            f.request("BLE_SESSION_OPEN", openPayload(1, "sess-1"));
            radio.run(5000 + OP_GRACE_MS + RELEASE_DEADLINE_MS);
            expect(f.core.owner() == BleProxyCore::Owner::None && radio.resets == 1, "recovered on the ticks");
            // An open checks first, without waiting for a tick: the proxy task may have slept through the deadline.
            Fixture g;
            int supervisedBeforeConnect = -1;
            g.radio.onConnect = [&](uint32_t)
            {
                supervisedBeforeConnect = g.radio.superviseCalls;
                return Error();
            };
            g.request("BLE_SESSION_OPEN", openPayload(1, "sess-1"));
            expect(supervisedBeforeConnect == 1, "the open asks the radio to recover before it connects");
        }

        void cancelAnsweredNeedsNoRecovery()
        {
            Fixture f;
            StuckController radio(f);
            radio.answersCancel = true; // the S3's controller
            f.request("BLE_SESSION_OPEN", openPayload(1, "sess-1"));
            radio.run(5000 + OP_GRACE_MS + 60000);
            expect(radio.resets == 0 && !radio.logged("ble link recovery"), "an event that comes needs no watchdog");
            f.request("BLE_SESSION_OPEN", openPayload(2, "sess-2"));
            expect(f.core.owner() == BleProxyCore::Owner::Session, "the next open connects");
        }
    }

    void runLinkWatchdogTests()
    {
        eventOnTimeNeedsNothing();
        lostEventIsForgotten();
        stuckProcedureIsRetriedThenTheControllerReset();
        askingAgainNeverPostponesTheRecovery();
        deadlinesSurviveTheClockWrapping();
        connectTimeoutWithoutItsEventRecovers();
        lostEventIsForgottenBeforeTheNextConnect();
        connectRecoversBeforeItIsRefused();
        cancelAnsweredNeedsNoRecovery();
    }
}
