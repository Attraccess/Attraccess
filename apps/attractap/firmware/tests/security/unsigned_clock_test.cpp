#include "clock/wall_clock.hpp"
#include "security/trusted_time.hpp"
#include <cassert>
// Replace only the wall-clock device syscalls, never the host's real clock.
static timeval unsignedTime{0, 0};
extern "C" int reader_test_gettimeofday(timeval *value, void *) { *value = unsignedTime; return 0; }
extern "C" int reader_test_settimeofday(const timeval *value, const struct timezone *) { unsignedTime = *value; return 0; }
void check_unsigned_clock_isolation() {
    const auto verified = ReaderSecurity::TrustedTime::now();
    assert(verified > 0);
    WallClock::onServerTime(1735689600000LL, 60);
    assert(unsignedTime.tv_sec == 1735689600);
    const timeval sntp{4000000000LL, 0};
    assert(WallClock::onSntpTime(sntp));
    assert(unsignedTime.tv_sec == 4000000000LL);
    assert(ReaderSecurity::TrustedTime::now() >= verified && ReaderSecurity::TrustedTime::now() <= verified + 1);
}
