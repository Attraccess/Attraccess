#pragma once

#include "../../clock/wall_clock.hpp"
#include <cstdio>
#include <string>

// German wall-clock formatting for the idle screens.
namespace WallClockText
{
    inline const char *weekday(const WallClock::LocalTime &time)
    {
        static const char *names[] = {"Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"};
        return names[time.weekday % 7];
    }

    inline const char *month(const WallClock::LocalTime &time)
    {
        static const char *names[] = {"Januar", "Februar", "März", "April", "Mai", "Juni",
                                      "Juli", "August", "September", "Oktober", "November", "Dezember"};
        return names[(time.month + 11) % 12];
    }

    // "14:32"
    inline std::string clock(const WallClock::LocalTime &time)
    {
        char text[8];
        snprintf(text, sizeof(text), "%02d:%02d", time.hour % 24, time.minute % 60);
        return text;
    }

    // "10. Oktober" or "10. Oktober 2026"
    inline std::string date(const WallClock::LocalTime &time, bool withYear)
    {
        std::string text = std::to_string(time.day) + ". " + month(time);
        return withYear ? text + " " + std::to_string(time.year) : text;
    }

    // Changes once per minute; -1 while the time is unknown.
    inline int64_t minuteKey(const WallClock::LocalTime &time)
    {
        if (!time.valid) return -1;
        return ((((int64_t)time.year * 13 + time.month) * 32 + time.day) * 24 + time.hour) * 60 + time.minute;
    }
}
