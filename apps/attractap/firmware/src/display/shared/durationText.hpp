#pragma once

#include <cstdint>
#include <string>

#include "../i18n.hpp"
#include "../../api/session_duration.hpp"

// Texts for session durations (ATT-43): "45 min", "2 h", "1 h 30 min".
namespace DurationText
{
    inline FirmwareI18n::Text number(uint32_t value)
    {
        return FirmwareI18n::Text::literal(std::to_string(value)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */;
    }

    inline FirmwareI18n::Text minutes(uint32_t totalMinutes)
    {
        const auto split = SessionDuration::splitMinutes(totalMinutes);
        if (split.hours == 0) return FirmwareI18n::Text::format(FirmwareI18n::Message::DurationMinutes, {number(split.minutes)});
        if (split.minutes == 0) return FirmwareI18n::Text::format(FirmwareI18n::Message::DurationHours, {number(split.hours)});
        return FirmwareI18n::Text::format(FirmwareI18n::Message::DurationHoursMinutes, {number(split.hours), number(split.minutes)});
    }

    // "H:MM:SS" countdown of a number of seconds, "MM:SS" below an hour.
    inline std::string countdown(uint32_t seconds)
    {
        const uint32_t h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60;
        char buf[16];
        if (h == 0) snprintf(buf, sizeof buf, "%02u:%02u", (unsigned)m, (unsigned)s);
        else snprintf(buf, sizeof buf, "%u:%02u:%02u", (unsigned)h, (unsigned)m, (unsigned)s);
        return buf;
    }
}
