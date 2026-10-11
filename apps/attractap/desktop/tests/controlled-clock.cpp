#include "controlled-clock.hpp"
#include <chrono>
#include <sys/time.h>

namespace
{
    time_t epoch = 1767268800;
    auto anchor = std::chrono::steady_clock::now();
}

void TestClock::set(time_t utc)
{
    epoch = utc;
    anchor = std::chrono::steady_clock::now();
}

#ifdef __GLIBC__
#define CLOCK_NOEXCEPT noexcept
#else
#define CLOCK_NOEXCEPT
#endif

extern "C" time_t time(time_t *result) CLOCK_NOEXCEPT
{
    const auto utc = epoch + std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now() - anchor).count();
    if (result) *result = utc;
    return utc;
}

extern "C" int settimeofday(const timeval *value, const struct timezone *) CLOCK_NOEXCEPT
{
    TestClock::set(value->tv_sec);
    return 0;
}
