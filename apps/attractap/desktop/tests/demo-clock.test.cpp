#include "api/demo/clock.hpp"
#include "clock/wall_clock.hpp"
#include <cassert>
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
    WallClock::onServerTime(0, 0);
    assert(!WallClock::now().valid);
    constexpr int32_t invalidOffsets[] = {std::numeric_limits<int32_t>::min(),
                                         std::numeric_limits<int32_t>::max(), -841, 841};
    // Invalid offsets must not initialize either UTC or the displayed timezone.
    for (const auto offset : invalidOffsets)
    {
        WallClock::onServerTime(1767268800000, offset);
        assert(utc == 0);
        assert(clockSets == 0);
        assert(!WallClock::now().valid);
    }
    DemoClock::initialize();
    assert(utc == 1767268800);
    assert(clockSets == 1);
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
            assert(utc == 1767268800 && clockSets == 1);
            assert(retained.valid && retained.year == local.year && retained.month == local.month);
            assert(retained.day == local.day && retained.weekday == local.weekday);
            assert(retained.hour == local.hour && retained.minute == local.minute);
        }
    };
    assertRejectedOffsets();
    WallClock::onSntpSynced();
    assertRejectedOffsets();

    // Repeated setup and a preset device/host clock retain their timeline.
    utc += 60;
    DemoClock::initialize();
    assert(utc == 1767268860);
    assert(clockSets == 1);
    utc = 1791635520;
    DemoClock::initialize();
    assert(utc == 1791635520);
    assert(clockSets == 1);
}
