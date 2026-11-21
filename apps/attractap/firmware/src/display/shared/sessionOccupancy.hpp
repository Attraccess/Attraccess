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

    namespace detail
    {
        inline FirmwareI18n::Text number(unsigned value)
        {
            return FirmwareI18n::Text::literal(std::to_string(value)) /* i18n-data: Supplied number, address, timestamp, duration or numeric progress; the enclosing UI message owns its caption. */;
        }

        // `message` with `first` moved in (no deep copy of a long name list) and `second` copied.
        inline FirmwareI18n::Text joined(FirmwareI18n::Message message, FirmwareI18n::Text &&first, const FirmwareI18n::Text &second)
        {
            std::vector<FirmwareI18n::Text> arguments;
            arguments.reserve(2);
            arguments.push_back(std::move(first));
            arguments.push_back(second);
            return FirmwareI18n::Text::format(message, std::move(arguments));
        }

        // Whether `text` fits one line of `label`, in its font, in both firmware languages (the Text is rendered
        // again on a language switch, so the fit must hold for either wording).
        inline bool fitsLine(const FirmwareI18n::Text &text, lv_obj_t *label)
        {
            const lv_font_t *font = lv_obj_get_style_text_font(label, LV_PART_MAIN);
            const int32_t letterSpace = lv_obj_get_style_text_letter_space(label, LV_PART_MAIN);
            const int32_t width = lv_obj_get_content_width(label);
            for (const char *locale : {"de", "en"})
            {
                lv_point_t size{};
                lv_text_get_size(&size, text.render(locale).c_str(), font, letterSpace, 0, LV_COORD_MAX, LV_TEXT_FLAG_NONE);
                if (size.x > width) return false;
            }
            return true;
        }

        // A user name as one line: control characters (a newline would hide the rest of the caption) become spaces.
        inline std::string oneLine(const char *name)
        {
            std::string result(name);
            for (char &c : result)
                if (static_cast<unsigned char>(c) < 0x20 || c == 0x7F) c = ' ';
            return result;
        }
    }

    // Own session first, then "Full", then "In use k/N". Free machines return an empty caption.
    inline FirmwareI18n::Text caption(uint16_t activeCount, uint16_t limit, bool ownsUsage)
    {
        if (ownsUsage) return FirmwareI18n::Message::InUseByYou;
        const Level value = level(activeCount, limit);
        if (value == Level::Full) return FirmwareI18n::Message::ResourceFull;
        if (value == Level::Free) return FirmwareI18n::Text();
        return FirmwareI18n::Text::format(FirmwareI18n::Message::InUseCount, {detail::number(activeCount), detail::number(limit)});
    }

    inline FirmwareI18n::Text caption(const API::ResourceBrief &resource, bool ownsUsage)
    {
        return caption(resource.activeSessionCount, resource.maxParallelSessions, ownsUsage);
    }

    // "Alex, Sam +2 \u00B7 4/6" for `label`: who uses a parallel machine, then the count ("Full" once no slot is
    // left). The own session (`ownSessionId`, 0 for none) comes first as "you", then the server's order. Only whole
    // names that fit the label's line are listed; the rest is "+N" (counted against `activeCount`, which may exceed
    // the capped list). Without any name it is caption(); a free machine gets an empty caption. Lays out the screen.
    inline FirmwareI18n::Text usersCaption(const std::vector<API::ActiveSession> &sessions, uint16_t activeCount,
                                           uint16_t limit, uint32_t ownSessionId, lv_obj_t *label)
    {
        using FirmwareI18n::Message;
        using FirmwareI18n::Text;
        if (activeCount == 0) return Text();
        std::vector<Text> names;
        names.reserve(sessions.size() + 1);
        if (ownSessionId != 0) names.push_back(Text(Message::SessionYou)); // shown even if the capped list misses it
        for (const auto &session : sessions)
            if (session.id != ownSessionId && session.username[0] != '\0')
                names.push_back(Text::literal(detail::oneLine(session.username)) /* i18n-data: Server-supplied resource/user/introducer name, description, health reason or flow caption; preserve exact contents. */);
        if (sessions.empty() || names.empty())
            return caption(activeCount, limit, ownSessionId != 0); // no names from the server: the plain count
        lv_obj_update_layout(label);
        const unsigned total = std::max<unsigned>(activeCount, names.size());
        const Text count = level(activeCount, limit) == Level::Full
                               ? Text(Message::ResourceFull)
                               : Text::format(Message::SessionCountOf, {detail::number(activeCount), detail::number(limit)});
        auto line = [&](Text list, size_t shown) {
            if (total > shown) list = detail::joined(Message::SessionNamesMore, std::move(list), detail::number(total - shown));
            return detail::joined(Message::SessionUsersLine, std::move(list), count);
        };
        // Everyone fits (no "+N" needed)?
        Text list = names[0];
        for (size_t i = 1; i < names.size(); ++i) list = detail::joined(Message::SessionNameJoin, std::move(list), names[i]);
        Text candidate = line(std::move(list), names.size());
        if (detail::fitsLine(candidate, label)) return candidate;
        // Else grow from one name while the next one still fits; few names fit, so this stays short.
        list = names[0];
        Text best = line(list, 1);
        if (detail::fitsLine(best, label))
        {
            for (size_t shown = 2; shown < names.size(); ++shown)
            {
                list = detail::joined(Message::SessionNameJoin, std::move(list), names[shown - 1]);
                candidate = line(list, shown);
                if (!detail::fitsLine(candidate, label)) break;
                best = std::move(candidate);
            }
            return best;
        }
        if (!names[0].isLiteral) return best;
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
            if (cut.empty()) break; // keep at least one character of the name
            candidate = line(Text::literal(cut + "...") /* i18n-data: Server-supplied user name, shortened to fit; preserve the contents. */, 1);
            if (detail::fitsLine(candidate, label)) return candidate;
        }
        return best;
    }
}
