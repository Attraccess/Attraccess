#pragma once

#include "../../api/api.hpp"
#include "../messages.hpp"
#include <string>

// Occupancy captions for machines that allow several people at once (ATT-1189).
// Machines limited to one session keep the classic "In use: <name>" wording.
namespace SessionOccupancy
{
    enum class Level { Free, Busy, Full };

    inline Level level(const API::ResourceBrief &resource)
    {
        if (resource.isFull()) return Level::Full;
        return resource.activeSessionCount > 0 ? Level::Busy : Level::Free;
    }

    // Own session first, then "Full", then "In use k/N". Free machines return an empty caption.
    inline FirmwareI18n::Text caption(const API::ResourceBrief &resource, bool ownsUsage)
    {
        if (ownsUsage) return FirmwareI18n::Message::InUseByYou;
        if (resource.isFull()) return FirmwareI18n::Message::ResourceFull;
        if (resource.activeSessionCount == 0) return FirmwareI18n::Text();
        return FirmwareI18n::Text::format(FirmwareI18n::Message::InUseCount, {
            FirmwareI18n::Text::literal(std::to_string(resource.activeSessionCount)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */,
            FirmwareI18n::Text::literal(std::to_string(resource.maxParallelSessions)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */});
    }
}
