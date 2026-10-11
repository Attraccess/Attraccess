#pragma once

#include "../../clock/wall_clock.hpp"
#include "../messages.hpp"
#include <cstdio>
#include <string>

// Localized date captions and language-neutral clock values for idle screens.
namespace WallClockText
{
    inline FirmwareI18n::Message weekday(const WallClock::LocalTime &time)
    {
        using FirmwareI18n::Message;
        static constexpr Message names[] = {Message::Sunday, Message::Monday, Message::Tuesday,
            Message::Wednesday, Message::Thursday, Message::Friday, Message::Saturday};
        return names[time.weekday % 7];
    }

    inline FirmwareI18n::Message month(const WallClock::LocalTime &time)
    {
        using FirmwareI18n::Message;
        static constexpr Message names[] = {Message::January, Message::February, Message::March,
            Message::April, Message::May, Message::June, Message::July, Message::August,
            Message::September, Message::October, Message::November, Message::December};
        return names[(time.month + 11) % 12];
    }

    // "14:32"
    inline std::string clock(const WallClock::LocalTime &time)
    {
        char text[8];
        snprintf(text, sizeof(text), "%02d:%02d", time.hour % 24, time.minute % 60);
        return text;
    }

    inline FirmwareI18n::Text date(const WallClock::LocalTime &time, bool withYear)
    {
        using namespace FirmwareI18n;
        const auto caption = Text::format(Message::ClockDate,
            {FirmwareI18n::Text::literal(std::to_string(time.day)), month(time)});
        return withYear ? Text::format(Message::ClockDateWithYear,
            {caption, FirmwareI18n::Text::literal(std::to_string(time.year))}) : caption;
    }

    // Changes once per minute; -1 while the time is unknown.
    inline int64_t minuteKey(const WallClock::LocalTime &time)
    {
        if (!time.valid) return -1;
        return ((((int64_t)time.year * 13 + time.month) * 32 + time.day) * 24 + time.hour) * 60 + time.minute;
    }
}
