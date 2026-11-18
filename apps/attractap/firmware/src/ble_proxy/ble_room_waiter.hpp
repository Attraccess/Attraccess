#pragma once

// Whether the proxy task waits for room in the websocket send queue. The send task frees slots and wakes the proxy
// task only while it waits, so a burst resumes as soon as a slot is free and a reader without BLE work never wakes.
// Plain C++ (no FreeRTOS), so host tests cover it.

#include <atomic>

namespace ble
{
    class RoomWaiter
    {
    public:
        // Proxy task: one attempt to hand something to the websocket. Marked as waiting before the attempt, so a
        // slot freed while it fails still wakes the task.
        template <typename Attempt> bool attempt(Attempt &&tryOnce)
        {
            waiting.store(true);
            const bool taken = tryOnce();
            if (taken) waiting.store(false);
            return taken;
        }
        // Send task: a slot freed. true: the proxy task waits for it and must be woken (once).
        bool slotFreed() { return waiting.exchange(false); }

    private:
        std::atomic<bool> waiting{false};
    };
}
