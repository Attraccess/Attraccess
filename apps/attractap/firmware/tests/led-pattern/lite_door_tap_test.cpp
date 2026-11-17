// Host test: what a tap on a Lite door reader sends.
#include "../../src/application/lite_door_tap.hpp"

#include <cstdio>

static int failures = 0;
#define CHECK(cond)                                                              \
    do {                                                                         \
        if (!(cond)) { std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } \
    } while (0)

int main()
{
    // A regular door: short tap unlocks, long tap locks.
    CHECK(liteDoorAction(false, false) == LiteDoorAction::Unlock);
    CHECK(liteDoorAction(false, true) == LiteDoorAction::Lock);
    // An access-only door only opens (an unlock), whatever the tap.
    CHECK(liteDoorAction(true, false) == LiteDoorAction::Unlock);
    CHECK(liteDoorAction(true, true) == LiteDoorAction::Unlock);

    if (failures) return 1;
    std::puts("lite door tap ok");
    return 0;
}
