#pragma once

#include "clock/wall_clock.hpp"
#include <cerrno>
#include <cstdio>
#include <ctime>
#include <sys/time.h>

namespace DemoClock
{
    inline int32_t utcOffsetMinutes(time_t instant)
    {
        tm local{}, utc{};
        if (!localtime_r(&instant, &local) || !gmtime_r(&instant, &utc)) return 0;
        // Compare calendar fields for the same instant. Reinterpreting UTC
        // with mktime can choose DST from the wrong side of a transition.
        const int days = local.tm_year == utc.tm_year ? local.tm_yday - utc.tm_yday
            : (local.tm_year < utc.tm_year ? -1 : 1);
        return days * 1440 + (local.tm_hour - utc.tm_hour) * 60 + local.tm_min - utc.tm_min;
    }

    inline void refresh()
    {
        WallClock::onDemoTime(utcOffsetMinutes(std::time(nullptr)));
    }

    inline bool initialize()
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
            if (settimeofday(&start, nullptr) != 0)
            {
                std::fprintf(stderr, "DemoClock: initialization failed (errno %d)\n", errno);
                return false;
            }
        }

        // Demo dates are trusted local presets, not network time samples.
        // Publish their timezone directly so historical presets remain visible.
        refresh();
        return true;
    }
}
