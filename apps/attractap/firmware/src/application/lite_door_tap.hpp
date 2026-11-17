#pragma once

// Lite door taps (no screen): a short tap unlocks, a long tap locks. An access-only door only opens, which is an
// unlock on the wire, whatever the tap. Hardware-free so tests/led-pattern covers it.

enum class LiteDoorAction
{
    Unlock,
    Lock,
};

inline LiteDoorAction liteDoorAction(bool accessOnly, bool longTap)
{
    return longTap && !accessOnly ? LiteDoorAction::Lock : LiteDoorAction::Unlock;
}
