#pragma once

#include <cstdint>

// Lower bound for "now" that an attacker can not move backwards. It starts at the firmware's
// release floor and only ever rises, and only from time the pinned server sent inside the
// authenticated session. SNTP and the plain channel never lower it, so a replayed or forged
// early time can not make an expired certificate look valid again.
class TimeFloor
{
public:
    // 2026-10-01T00:00:00Z: no certificate the reader sees can have expired before this firmware was built.
    static constexpr uint32_t FIRMWARE_FLOOR_SECONDS = 1790812800U;
    // Persist at most once a day so NVS does not wear on every session.
    static constexpr uint32_t PERSIST_STEP_SECONDS = 24U * 60U * 60U;

    explicit TimeFloor(uint32_t storedSeconds = 0)
        : floorSeconds(storedSeconds > FIRMWARE_FLOOR_SECONDS ? storedSeconds : FIRMWARE_FLOOR_SECONDS),
          persistedSeconds(storedSeconds)
    {
    }

    uint32_t seconds() const { return floorSeconds; }

    // Authenticated server time. Returns true when the new floor should be written to NVS.
    bool raise(uint32_t authenticatedSeconds)
    {
        if (authenticatedSeconds <= floorSeconds)
        {
            return false;
        }
        floorSeconds = authenticatedSeconds;
        if (floorSeconds - persistedSeconds < PERSIST_STEP_SECONDS)
        {
            return false;
        }
        persistedSeconds = floorSeconds;
        return true;
    }

private:
    uint32_t floorSeconds;
    uint32_t persistedSeconds;
};
