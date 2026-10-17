#pragma once
#include <ctime>

namespace TestClock
{
    // Changes only this test process's POSIX clock; millis() stays monotonic.
    void set(time_t utc);
}
