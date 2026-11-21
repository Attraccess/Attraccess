#pragma once

#include "../../api/api.hpp"
#include "../messages.hpp"
#include "../theme.hpp"
#include <algorithm>
#include <string>
#include <vector>

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

    // The caption's pieces are literals for user names and catalog entries for everything else.
    inline FirmwareI18n::Text number(unsigned value)
    {
        return FirmwareI18n::Text::literal(std::to_string(value)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */;
    }

    // Whether `text` fits one line of `width` pixels in the label font, in both firmware languages (the Text is
    // rendered again on a language switch, so the fit must hold for either wording).
    inline bool fitsLine(const FirmwareI18n::Text &text, const lv_font_t *font, int32_t width)
    {
        for (const char *locale : {"de", "en"})
        {
            lv_point_t size{};
            lv_text_get_size(&size, text.render(locale).c_str(), font, 0, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
            if (size.x > width) return false;
        }
        return true;
    }

    // "Alex, Sam +2 \u00B7 4/6": who uses a parallel machine, then the count ("Full" once no slot is left).
    // The own session (`ownSessionId`, 0 for none) comes first as "you", then the server's order. Only whole names
    // that fit `width` are listed; the rest is "+N" (counted against `activeCount`, which may exceed the capped list).
    // Returns an empty caption when no session has a name so the caller falls back to caption().
    inline FirmwareI18n::Text usersCaption(const std::vector<API::ActiveSession> &sessions, uint16_t activeCount,
                                           uint16_t limit, uint32_t ownSessionId, const lv_font_t *font, int32_t width)
    {
        using FirmwareI18n::Message;
        using FirmwareI18n::Text;
        if (sessions.empty() || activeCount == 0) return Text();
        std::vector<Text> names;
        names.reserve(sessions.size());
        for (const auto &session : sessions)
        {
            if (ownSessionId != 0 && session.id == ownSessionId) names.insert(names.begin(), Text(Message::SessionYou));
            else if (session.username[0] != '\0') names.push_back(Text::literal(session.username) /* i18n-data: Server-supplied resource/user/introducer name, description, health reason or flow caption; preserve exact contents. */);
        }
        if (names.empty()) return Text(); // Only nameless sessions: the caller shows the plain count.
        const unsigned total = std::max<unsigned>(activeCount, names.size());
        const Text count = level(activeCount, limit) == Level::Full
                               ? Text(Message::ResourceFull)
                               : Text::format(Message::SessionCountOf, {number(activeCount), number(limit)});
        auto line = [&](size_t shown, const Text &first) {
            Text list = first;
            for (size_t i = 1; i < shown; ++i) list = Text::format(Message::SessionNameJoin, {list, names[i]});
            if (total > shown) list = Text::format(Message::SessionNamesMore, {list, number(total - shown)});
            return Text::format(Message::SessionUsersLine, {list, count});
        };
        for (size_t shown = names.size(); shown > 1; --shown)
        {
            const Text candidate = line(shown, names[0]);
            if (fitsLine(candidate, font, width)) return candidate;
        }
        const Text single = line(1, names[0]);
        if (!names[0].isLiteral || fitsLine(single, font, width)) return single;
        // Not even the first name fits: shorten it here (whole UTF-8 characters) so the label's own ellipsis does not
        // swallow the "+N \u00B7 k/N" tail.
        std::string cut = names[0].value;
        while (!cut.empty())
        {
            unsigned char last;
            do
            {
                last = static_cast<unsigned char>(cut.back());
                cut.pop_back();
            } while ((last & 0xC0) == 0x80 && !cut.empty());
            const Text candidate = line(1, Text::literal(cut + "...") /* i18n-data: Server-supplied user name, shortened to fit; preserve the contents. */);
            if (fitsLine(candidate, font, width)) return candidate;
        }
        return single;
    }
}
