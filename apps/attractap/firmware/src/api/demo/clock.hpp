#pragma once

#include <ctime>
#include <sys/time.h>

namespace DemoClock
{
    inline void initialize()
    {
        // Offline demos never start SNTP. Preserve a preset clock (including
        // the desktop host's), but give cold boots a plausible demo date.
        if (std::time(nullptr) < 1735689600) // 2025-01-01T00:00:00Z
        {
            const timeval start{1767268800, 0}; // 2026-01-01T12:00:00Z
            settimeofday(&start, nullptr);
        }
    }
}
