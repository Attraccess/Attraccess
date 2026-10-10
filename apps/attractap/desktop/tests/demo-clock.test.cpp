#include "api/demo/clock.hpp"
#include "clock/wall_clock.hpp"
#include <cassert>

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
    DemoClock::initialize();
    assert(utc == 1767268800);
    assert(clockSets == 1);
    WallClock::onServerTime(static_cast<int64_t>(utc) * 1000, 0);
    assert(WallClock::now().valid);
    assert(WallClock::now().year == 2026);

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
