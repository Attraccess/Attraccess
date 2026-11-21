#pragma once

// Recovers the radio's link state when NimBLE never reports an event it owes (ATT-1315). The radio tracks a
// connect or a link until NimBLE's connect or disconnect event confirms it ended, so that a late event can never end
// the next session. QA on the BLE bridge (classic ESP32 controller) saw a connect cancel whose connection complete
// event never came: NimBLE's host stayed in its connect procedure, and every later connect was refused link-busy
// until a reboot. NimBLE notes the gap itself ("set a timer to reset the controller if a connection complete event
// isn't received"): this is that timer.
//
// Once the event is overdue the radio asks NimBLE whether it still runs the procedure (the connect it initiates, the
// link it holds):
// - no: the event was lost, the radio forgets the link and reports what the event would have;
// - yes: the radio asks once more (a second cancel or terminate), then resets the controller. The reset ends every
//   procedure and link with an event, and leaves nothing NimBLE could still report later.
// A stack restart would add nothing: it waits for the same host task the reset runs on.
//
// Plain C++ (no NimBLE), so host tests drive it with a fake clock.

#include <cstdint>

namespace ble
{
    class LinkWatchdog
    {
    public:
        enum class Action : uint8_t
        {
            None,
            Forget, // NimBLE no longer runs the procedure: its event was lost
            Retry,  // ask NimBLE again to cancel the connect or terminate the link
            Reset,  // reset the controller
        };

        // How long an event may come after the time NimBLE should have sent it.
        static constexpr uint32_t EVENT_GRACE_MS = 2000;
        // How long a controller reset may take to report its events; then it is reset again.
        static constexpr uint32_t RESET_WAIT_MS = 5000;

        // A procedure started that NimBLE ends with an event within `withinMs`. An earlier deadline that is still
        // armed stays: asking again (a second terminate) never postpones the recovery.
        void expect(uint32_t now, uint32_t withinMs)
        {
            const uint32_t deadline = now + withinMs + EVENT_GRACE_MS;
            if (stage == Stage::Idle || before(deadline, nextCheck)) nextCheck = deadline;
            if (stage == Stage::Idle) stage = Stage::Waiting;
        }

        // NimBLE reported the event: nothing is owed any more.
        void settled() { stage = Stage::Idle; }

        bool armed() const { return stage != Stage::Idle; }

        // `stillRunning`: NimBLE still runs the procedure the event would end.
        Action check(uint32_t now, bool stillRunning)
        {
            if (stage == Stage::Idle || before(now, nextCheck)) return Action::None;
            if (!stillRunning)
            {
                stage = Stage::Idle;
                return Action::Forget;
            }
            if (stage == Stage::Waiting)
            {
                stage = Stage::Retried;
                nextCheck = now + EVENT_GRACE_MS;
                return Action::Retry;
            }
            stage = Stage::Reset;
            nextCheck = now + RESET_WAIT_MS;
            return Action::Reset;
        }

    private:
        enum class Stage : uint8_t
        {
            Idle,
            Waiting,
            Retried,
            Reset,
        };

        static bool before(uint32_t a, uint32_t b) { return static_cast<int32_t>(a - b) < 0; }

        Stage stage = Stage::Idle;
        uint32_t nextCheck = 0;
    };

    inline const char *watchdogActionName(LinkWatchdog::Action action)
    {
        switch (action)
        {
        case LinkWatchdog::Action::Forget: return "forget";
        case LinkWatchdog::Action::Retry: return "retry";
        case LinkWatchdog::Action::Reset: return "reset-controller";
        default: return "none";
        }
    }
}
