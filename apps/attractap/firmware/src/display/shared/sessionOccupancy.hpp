#pragma once

#include "../../api/api.hpp"
#include "../messages.hpp"
#include "../theme.hpp"
#include <string>

// Occupancy captions for machines that allow several people at once (ATT-1189).
// Machines limited to one session keep the classic "In use: <name>" wording.
namespace SessionOccupancy
{
    enum class Level { Free, Busy, Full };

    inline Level level(uint16_t activeCount, uint16_t limit)
    {
        if (activeCount >= limit) return Level::Full;
        return activeCount > 0 ? Level::Busy : Level::Free;
    }

    inline Level level(const API::ResourceBrief &resource)
    {
        return level(resource.activeSessionCount, resource.maxParallelSessions);
    }

    // Full reads as blocked, partly used as a caution, free as available.
    inline lv_color_t color(Level value)
    {
        if (value == Level::Full) return DisplayTheme::danger();
        return value == Level::Busy ? DisplayTheme::warning() : DisplayTheme::success();
    }

    // Own session first, then "Full", then "In use k/N". Free machines return an empty caption.
    inline FirmwareI18n::Text caption(uint16_t activeCount, uint16_t limit, bool ownsUsage)
    {
        if (ownsUsage) return FirmwareI18n::Message::InUseByYou;
        const Level value = level(activeCount, limit);
        if (value == Level::Full) return FirmwareI18n::Message::ResourceFull;
        if (value == Level::Free) return FirmwareI18n::Text();
        return FirmwareI18n::Text::format(FirmwareI18n::Message::InUseCount, {
            FirmwareI18n::Text::literal(std::to_string(activeCount)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */,
            FirmwareI18n::Text::literal(std::to_string(limit)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */});
    }

    inline FirmwareI18n::Text caption(const API::ResourceBrief &resource, bool ownsUsage)
    {
        return caption(resource.activeSessionCount, resource.maxParallelSessions, ownsUsage);
    }
}
