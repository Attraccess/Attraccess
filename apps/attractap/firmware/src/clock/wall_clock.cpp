#include "wall_clock.hpp"

#include <atomic>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <mutex>
#include <sys/time.h>

namespace
{
#ifdef ATTRACTAP_HOST
    // The desktop simulator runs on an already synchronized host clock.
    constexpr bool systemClockPreset = true;
#else
    constexpr bool systemClockPreset = false;
#endif
    // Network samples must be contemporary; demo presets are trusted separately.
    constexpr time_t EarliestPlausibleUtc = 1735689600; // 2025-01-01T00:00:00Z
    // Support network dates through 2099, rejecting corrupted future samples
    // before they can alter either UTC or the API-provided timezone.
    constexpr int64_t EndSupportedEpochMs = 4102444800000LL; // 2100-01-01T00:00:00Z, exclusive
    constexpr int64_t MaxFallbackDriftMs = 2000;
    constexpr int32_t MaxUtcOffsetMinutes = 14 * 60;

    std::atomic<bool> sntpSynced{systemClockPreset};
    std::atomic<bool> utcKnown{systemClockPreset};
    std::atomic<bool> demoTimeKnown{false};
    std::atomic<bool> offsetKnown{false};
    std::atomic<int32_t> offsetMinutes{0};
    std::mutex clockUpdateMutex;
}

bool WallClock::onSntpTime(const timeval &sample)
{
    const std::lock_guard<std::mutex> lock(clockUpdateMutex);
    if (settimeofday(&sample, nullptr) != 0)
    {
        std::fprintf(stderr, "WallClock: SNTP clock update failed (errno %d)\n", errno);
        return false;
    }
    sntpSynced = true;
    utcKnown = true;
    return true;
}

void WallClock::onDemoTime(int32_t utcOffsetMinutes)
{
    if (utcOffsetMinutes < -MaxUtcOffsetMinutes || utcOffsetMinutes > MaxUtcOffsetMinutes)
    {
        return;
    }
    offsetMinutes = utcOffsetMinutes;
    offsetKnown = true;
    utcKnown = true;
    demoTimeKnown = true;
}

void WallClock::onServerTime(int64_t epochMs, int32_t utcOffsetMinutes)
{
    if (epochMs / 1000 < EarliestPlausibleUtc || epochMs >= EndSupportedEpochMs ||
        utcOffsetMinutes < -MaxUtcOffsetMinutes || utcOffsetMinutes > MaxUtcOffsetMinutes)
    {
        return;
    }
    offsetMinutes = utcOffsetMinutes;
    offsetKnown = true;
    const std::lock_guard<std::mutex> lock(clockUpdateMutex);
    if (sntpSynced)
    {
        return;
    }

    timeval current{};
    if (gettimeofday(&current, nullptr) != 0)
    {
        std::fprintf(stderr, "WallClock: reading UTC failed (errno %d)\n", errno);
        return;
    }
    const int64_t currentMs = static_cast<int64_t>(current.tv_sec) * 1000 + current.tv_usec / 1000;
    if (std::llabs(currentMs - epochMs) > MaxFallbackDriftMs)
    {
        const timeval server{static_cast<time_t>(epochMs / 1000), static_cast<suseconds_t>((epochMs % 1000) * 1000)};
        if (settimeofday(&server, nullptr) != 0)
        {
            std::fprintf(stderr, "WallClock: API clock update failed (errno %d)\n", errno);
            return;
        }
    }
    utcKnown = true;
}

WallClock::LocalTime WallClock::now()
{
    LocalTime result;
    const time_t utc = time(nullptr);
    if (!utcKnown || !offsetKnown || (!demoTimeKnown && utc < EarliestPlausibleUtc))
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
