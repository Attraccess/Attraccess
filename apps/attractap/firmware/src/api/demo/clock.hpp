#pragma once

#include "clock/wall_clock.hpp"
#include <ctime>
#include <sys/time.h>

namespace DemoClock
{
    inline void initialize()
    {
        // An unset ESP clock counts elapsed time from the Unix epoch. Compare
        // it with uptime rather than rejecting deliberately preset dates.
        const time_t now = std::time(nullptr);
        timespec uptime{};
        const bool unset = now == 0 ||
            (clock_gettime(CLOCK_MONOTONIC, &uptime) == 0 &&
             now >= uptime.tv_sec - 1 && now <= uptime.tv_sec + 1);
        if (unset)
        {
            const timeval start{1767268800, 0}; // 2026-01-01T12:00:00Z
            settimeofday(&start, nullptr);
        }

        // Demo dates are trusted local presets, not network time samples.
        // Publish their timezone directly so historical presets remain visible.
        const time_t demoUtc = std::time(nullptr);
        tm utc{};
        gmtime_r(&demoUtc, &utc);
        utc.tm_isdst = -1;
        WallClock::onDemoTime(static_cast<int32_t>(difftime(demoUtc, mktime(&utc)) / 60));
    }
}
