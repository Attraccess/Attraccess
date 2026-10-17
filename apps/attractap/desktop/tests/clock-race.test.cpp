#include "clock/wall_clock.hpp"
#include <atomic>
#include <cassert>
#include <chrono>
#include <future>
#include <thread>

namespace
{
    constexpr time_t apiUtc = 1767355200;
    constexpr time_t sntpUtc = 1767441600;
    std::atomic<time_t> utc{0};
    std::promise<void> apiWriteEntered;
    std::promise<void> releaseApiWrite;
    auto release = releaseApiWrite.get_future();
}

// Substitute only this process's POSIX clock, never the host's clock.
#ifdef __GLIBC__
#define CLOCK_NOEXCEPT noexcept
#else
#define CLOCK_NOEXCEPT
#endif

extern "C" time_t time(time_t *result) CLOCK_NOEXCEPT
{
    const auto value = utc.load();
    if (result) *result = value;
    return value;
}

extern "C" int gettimeofday(timeval *value, void *) CLOCK_NOEXCEPT
{
    value->tv_sec = utc.load();
    value->tv_usec = 0;
    return 0;
}

extern "C" int settimeofday(const timeval *value, const struct timezone *) CLOCK_NOEXCEPT
{
    if (value->tv_sec == apiUtc)
    {
        apiWriteEntered.set_value();
        release.wait();
    }
    utc = value->tv_sec;
    return 0;
}

int main()
{
    // Suspend an API correction after it checked SNTP priority. An SNTP
    // update must wait for that write, then establish the authoritative UTC.
    auto entered = apiWriteEntered.get_future();
    std::thread api([] { WallClock::onServerTime(static_cast<int64_t>(apiUtc) * 1000, 120); });
    entered.wait();
    std::promise<void> sntpStarted;
    auto started = sntpStarted.get_future();
    auto sntp = std::async(std::launch::async, [&]
    {
        sntpStarted.set_value();
        return WallClock::onSntpTime(timeval{sntpUtc, 0});
    });
    started.wait();
    assert(sntp.wait_for(std::chrono::milliseconds(100)) == std::future_status::timeout);
    releaseApiWrite.set_value();
    api.join();
    assert(sntp.get());
    assert(utc == sntpUtc);

    // Subsequent API samples retain SNTP UTC while updating the timezone.
    WallClock::onServerTime(static_cast<int64_t>(apiUtc) * 1000, -210);
    assert(utc == sntpUtc);
    const auto local = WallClock::now();
    assert(local.valid && local.day == 3 && local.hour == 8 && local.minute == 30);
}
