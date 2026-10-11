#include "api/demo/clock.hpp"
#include "clock/wall_clock.hpp"
#include <cassert>
#include <cstdlib>
#include <limits>

namespace
{
    time_t utc = 0;
    unsigned clockSets = 0;
}

// This standalone test substitutes the POSIX clock; it never sets host time.
#ifdef __GLIBC__
#define CLOCK_NOEXCEPT noexcept
#else
#define CLOCK_NOEXCEPT
#endif

extern "C" time_t time(time_t *result) CLOCK_NOEXCEPT
{
    if (result) *result = utc;
    return utc;
}

extern "C" int settimeofday(const timeval *value, const struct timezone *) CLOCK_NOEXCEPT
{
    utc = value->tv_sec;
    ++clockSets;
    return 0;
}

extern "C" int gettimeofday(timeval *value, void *) CLOCK_NOEXCEPT
{
    value->tv_sec = utc;
    value->tv_usec = 0;
    return 0;
}

int main()
{
    setenv("TZ", "UTC", 1);
    tzset();
    WallClock::onServerTime(0, 0);
    assert(!WallClock::now().valid);
    constexpr int32_t invalidOffsets[] = {std::numeric_limits<int32_t>::min(),
                                         std::numeric_limits<int32_t>::max(), -841, 841};
    constexpr int64_t firstSupportedEpochMs = 1735689600000LL; // 2025-01-01T00:00Z
    constexpr int64_t endSupportedEpochMs = 4102444800000LL;   // 2100-01-01T00:00Z, exclusive
    constexpr int64_t invalidEpochs[] = {firstSupportedEpochMs - 1, endSupportedEpochMs,
                                       endSupportedEpochMs + 1, 9000000000000000000LL,
                                       std::numeric_limits<int64_t>::max()};
    // Finite, representable but implausible epochs must not initialize state.
    for (const auto epoch : invalidEpochs)
    {
        WallClock::onServerTime(epoch, 60);
        assert(utc == 0 && clockSets == 0);
        assert(!WallClock::now().valid);
    }
    // Invalid offsets must not initialize either UTC or the displayed timezone.
    for (const auto offset : invalidOffsets)
    {
        WallClock::onServerTime(1767268800000, offset);
        assert(utc == 0);
        assert(clockSets == 0);
        assert(!WallClock::now().valid);
    }
    // A real API fallback sets a previously unset UTC clock before SNTP.
    WallClock::onServerTime(1767355200000, 120); // 2026-01-02T12:00Z
    assert(utc == 1767355200 && clockSets == 1);
    auto fallback = WallClock::now();
    assert(fallback.valid && fallback.day == 2 && fallback.hour == 14);
    utc = 0;
    DemoClock::initialize();
    assert(utc == 1767268800);
    assert(clockSets == 2);
    WallClock::onServerTime(static_cast<int64_t>(utc) * 1000, 0);
    assert(WallClock::now().valid);
    assert(WallClock::now().year == 2026);

    // Both supported offset boundaries still work, including date rollover.
    WallClock::onServerTime(static_cast<int64_t>(utc) * 1000, 840);
    auto local = WallClock::now();
    assert(local.valid && local.year == 2026 && local.month == 1 && local.day == 2);
    assert(local.hour == 2 && local.minute == 0);
    WallClock::onServerTime(static_cast<int64_t>(utc) * 1000, -840);
    local = WallClock::now();
    assert(local.valid && local.year == 2025 && local.month == 12 && local.day == 31);
    assert(local.hour == 22 && local.minute == 0);

    // Rejected samples preserve a valid clock before and after SNTP sync.
    const auto assertRejectedOffsets = [&]()
    {
        for (const auto offset : invalidOffsets)
        {
            WallClock::onServerTime(static_cast<int64_t>(utc + 86400) * 1000, offset);
            const auto retained = WallClock::now();
            assert(utc == 1767268800 && clockSets == 2);
            assert(retained.valid && retained.year == local.year && retained.month == local.month);
            assert(retained.day == local.day && retained.weekday == local.weekday);
            assert(retained.hour == local.hour && retained.minute == local.minute);
        }
    };
    const auto assertRejectedEpochs = [&]()
    {
        for (const auto epoch : invalidEpochs)
        {
            WallClock::onServerTime(epoch, 60);
            const auto retained = WallClock::now();
            assert(utc == 1767268800 && clockSets == 2);
            assert(retained.valid && retained.year == local.year && retained.month == local.month);
            assert(retained.day == local.day && retained.weekday == local.weekday);
            assert(retained.hour == local.hour && retained.minute == local.minute);
        }
    };
    assertRejectedOffsets();
    assertRejectedEpochs();
    WallClock::onSntpSynced();
    assertRejectedOffsets();
    assertRejectedEpochs();

    // Valid samples after SNTP update only the timezone, even with different UTC.
    WallClock::onServerTime(1767355200000, -210);
    assert(utc == 1767268800 && clockSets == 2);
    local = WallClock::now();
    assert(local.valid && local.day == 1 && local.hour == 8 && local.minute == 30);
    assertRejectedOffsets();
    assertRejectedEpochs();

    // Exact supported epoch boundaries still apply timezone updates after SNTP.
    WallClock::onServerTime(firstSupportedEpochMs, 345);
    local = WallClock::now();
    assert(local.valid && local.hour == 17 && local.minute == 45);
    WallClock::onServerTime(endSupportedEpochMs - 1, -210);
    local = WallClock::now();
    assert(local.valid && local.hour == 8 && local.minute == 30);
    assert(utc == 1767268800 && clockSets == 2);

    // Repeated setup and a preset device/host clock retain their timeline.
    utc += 60;
    DemoClock::initialize();
    assert(utc == 1767268860);
    assert(clockSets == 2);
    utc = 1791635520;
    DemoClock::initialize();
    assert(utc == 1791635520);
    assert(clockSets == 2);

    // A deliberate historical preset is not an uninitialized clock.
    utc = 1704067200; // 2024-01-01T00:00:00Z
    DemoClock::initialize();
    assert(utc == 1704067200 && clockSets == 2);
    local = WallClock::now();
    assert(local.valid && local.year == 2024 && local.month == 1 && local.day == 1);
    assert(local.hour == 0 && local.minute == 0);

    // Startup can happen several seconds after reset: an unset clock still
    // matches uptime and must receive the demonstration date.
    timespec uptime{};
    assert(clock_gettime(CLOCK_MONOTONIC, &uptime) == 0);
    utc = uptime.tv_sec;
    DemoClock::initialize();
    assert(utc == 1767268800 && clockSets == 3);
    assert(WallClock::now().valid && WallClock::now().year == 2026);
}
