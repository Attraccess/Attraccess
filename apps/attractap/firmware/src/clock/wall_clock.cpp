#include "wall_clock.hpp"

#include <atomic>
#include <cstdlib>
#include <ctime>
#include <sys/time.h>

namespace
{
#ifdef ATTRACTAP_HOST
    // The desktop simulator runs on an already synchronized host clock.
    constexpr bool systemClockPreset = true;
#else
    constexpr bool systemClockPreset = false;
#endif
    // Anything earlier means the system clock was never set (boots at 1970).
    constexpr time_t EarliestPlausibleUtc = 1735689600; // 2025-01-01T00:00:00Z
    constexpr int64_t MaxFallbackDriftMs = 2000;
    constexpr int32_t MaxUtcOffsetMinutes = 14 * 60;

    std::atomic<bool> sntpSynced{systemClockPreset};
    std::atomic<bool> utcKnown{systemClockPreset};
    std::atomic<bool> offsetKnown{false};
    std::atomic<int32_t> offsetMinutes{0};
}

void WallClock::onSntpSynced()
{
    sntpSynced = true;
    utcKnown = true;
}

void WallClock::onServerTime(int64_t epochMs, int32_t utcOffsetMinutes)
{
    if (epochMs / 1000 < EarliestPlausibleUtc || std::abs(utcOffsetMinutes) > MaxUtcOffsetMinutes)
    {
        return;
    }
    offsetMinutes = utcOffsetMinutes;
    offsetKnown = true;
    if (sntpSynced)
    {
        return;
    }

    timeval current{};
    gettimeofday(&current, nullptr);
    const int64_t currentMs = static_cast<int64_t>(current.tv_sec) * 1000 + current.tv_usec / 1000;
    if (std::llabs(currentMs - epochMs) > MaxFallbackDriftMs)
    {
        const timeval server{static_cast<time_t>(epochMs / 1000), static_cast<suseconds_t>((epochMs % 1000) * 1000)};
        settimeofday(&server, nullptr);
    }
    utcKnown = true;
}

WallClock::LocalTime WallClock::now()
{
    LocalTime result;
    const time_t utc = time(nullptr);
    if (!utcKnown || !offsetKnown || utc < EarliestPlausibleUtc)
    {
        return result;
    }
    const time_t local = utc + static_cast<time_t>(offsetMinutes) * 60;
    tm parts{};
    gmtime_r(&local, &parts);
    result.valid = true;
    result.year = parts.tm_year + 1900;
    result.month = parts.tm_mon + 1;
    result.day = parts.tm_mday;
    result.weekday = parts.tm_wday;
    result.hour = parts.tm_hour;
    result.minute = parts.tm_min;
    return result;
}
