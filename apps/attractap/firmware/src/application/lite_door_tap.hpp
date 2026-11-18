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

// The beep and LED cue once a tap counts as long say that it now does something else (lock the door, end the
// session). On an access-only door every tap opens, so there is no cue.
inline bool liteLongTapCue(bool accessOnlyDoor)
{
    return !accessOnlyDoor;
}
