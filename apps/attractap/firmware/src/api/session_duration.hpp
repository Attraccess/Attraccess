#pragma once

// Session duration rules of the reader (ATT-43), without any display or network code so host tests can run them.
// The server stays the authority: it refuses anything these helpers let through and the reader shows its reason.

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <string>

namespace SessionDuration {

// The longest a session can be, with or without a machine maximum (30 days).
constexpr uint32_t ABSOLUTE_MAX_MINUTES = 43200;
// Extension steps the server accepts, in minutes.
constexpr uint32_t EXTEND_STEPS_MINUTES[] = {60, 120, 240, 360, 720, 1440};
constexpr uint8_t EXTEND_STEP_COUNT = sizeof(EXTEND_STEPS_MINUTES) / sizeof(EXTEND_STEPS_MINUTES[0]);
// Quick picks of the duration input.
constexpr uint32_t QUICK_PICKS_MINUTES[] = {30, 60, 120, 240, 480};
constexpr uint8_t QUICK_PICK_COUNT = sizeof(QUICK_PICKS_MINUTES) / sizeof(QUICK_PICKS_MINUTES[0]);
// Stepper increments of the duration input.
constexpr uint32_t HOUR_STEP_MINUTES = 60;
constexpr uint32_t MINUTE_STEP_MINUTES = 5;

// The highest estimate the input may hold: the machine's maximum (0: none), never past the absolute limit.
inline uint32_t upperBound(uint32_t maxMinutes) {
    return maxMinutes == 0 ? ABSOLUTE_MAX_MINUTES : std::min(maxMinutes, ABSOLUTE_MAX_MINUTES);
}

inline bool isAllowed(uint32_t minutes, uint32_t maxMinutes) {
    return minutes >= 1 && minutes <= upperBound(maxMinutes);
}

// A value the input may hold: at least one minute, at most the upper bound.
inline uint32_t clamp(uint32_t minutes, uint32_t maxMinutes) {
    return std::max<uint32_t>(1, std::min(minutes, upperBound(maxMinutes)));
}

// The value the input opens with: one hour, or the maximum when that is shorter.
inline uint32_t initialMinutes(uint32_t maxMinutes) { return clamp(60, maxMinutes); }

// Steps the hour and minute fields; a step that would leave the allowed range stays at the bound.
inline uint32_t stepped(uint32_t minutes, int32_t deltaMinutes, uint32_t maxMinutes) {
    const int64_t next = static_cast<int64_t>(minutes) + deltaMinutes;
    if (next < 1) return 1;
    return clamp(static_cast<uint32_t>(next), maxMinutes);
}

// Seconds left of a deadline that was `inSeconds` away when the list arrived at `receivedMs`. Counts with the
// monotonic clock, so it needs no wall clock and survives millis() wrapping.
inline uint32_t remainingSeconds(uint32_t inSeconds, uint32_t receivedMs, uint32_t nowMs) {
    const uint32_t elapsed = (nowMs - receivedMs) / 1000;
    return elapsed >= inSeconds ? 0 : inSeconds - elapsed;
}

// Whether an extension by `stepMinutes` stays within the cap (the server refuses it otherwise).
inline bool canExtendBy(uint32_t autoEndInSeconds, uint32_t extendLimitInSeconds, uint32_t receivedMs, uint32_t nowMs,
                        uint32_t stepMinutes) {
    const uint32_t remaining = remainingSeconds(autoEndInSeconds, receivedMs, nowMs);
    const uint32_t room = remainingSeconds(extendLimitInSeconds, receivedMs, nowMs);
    return remaining > 0 && static_cast<uint64_t>(remaining) + static_cast<uint64_t>(stepMinutes) * 60 <= room;
}

// "To maximum" exists only for a machine with a maximum, and only while there is room below it.
inline bool canExtendToMax(bool hasMaxSessionTime, uint32_t autoEndInSeconds, uint32_t extendLimitInSeconds,
                           uint32_t receivedMs, uint32_t nowMs) {
    const uint32_t remaining = remainingSeconds(autoEndInSeconds, receivedMs, nowMs);
    return hasMaxSessionTime && remaining > 0 && remainingSeconds(extendLimitInSeconds, receivedMs, nowMs) > remaining;
}

// "H:MM" for a count of seconds, rounded up to whole minutes (a countdown never reads 0:00 while time is left).
struct HoursMinutes {
    uint32_t hours;
    uint32_t minutes;
};
inline HoursMinutes splitMinutes(uint32_t totalMinutes) { return {totalMinutes / 60, totalMinutes % 60}; }
inline uint32_t ceilMinutes(uint32_t seconds) { return (seconds + 59) / 60; }

// Local wall-clock "HH:MM" of a server timestamp. The epoch comes from the server, never from the reader's clock, so it
// is right even on a reader that has no time set; an unusable epoch (0, or the parser's failure value) gives "".
inline std::string clockString(uint32_t epoch, int32_t utcOffsetMinutes) {
    if (epoch == 0 || epoch == 0xFFFFFFFFu) return std::string();
    const int64_t local = static_cast<int64_t>(epoch) + static_cast<int64_t>(utcOffsetMinutes) * 60;
    const int64_t secondOfDay = ((local % 86400) + 86400) % 86400;
    char buf[8];
    snprintf(buf, sizeof buf, "%02d:%02d", static_cast<int>(secondOfDay / 3600), static_cast<int>((secondOfDay % 3600) / 60));
    return buf;
}

} // namespace SessionDuration
