#pragma once

// Colour pattern a reader without a screen shows while it waits for approval. Hardware-free so it
// can be tested on the host, see tests/led-pattern.

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

namespace LedPattern
{
    constexpr size_t SEGMENT_COUNT = 4;

    // How long past its due rotation the reader keeps showing a pattern without a new one. After that it
    // breathes white, so a dropped connection can not leave an old pattern that matches someone else's
    // list entry. The server keeps the patterns of a reader that left reserved for rotation + this grace
    // (ENROLLMENT_PATTERN_COOLDOWN_MS).
    constexpr uint32_t STALE_GRACE_MS = 10000;

    struct Pattern
    {
        // 0xRRGGBB per segment
        uint32_t segments[SEGMENT_COUNT];
    };

    // Colours the server may send. Orange and cyan are left out because they are hard to tell apart
    // from yellow and white on a WS2812.
    inline bool colorFromName(const char *name, uint32_t &rgb)
    {
        struct Entry
        {
            const char *name;
            uint32_t rgb;
        };
        static const Entry colors[] = {
            {"red", 0xFF0000},
            {"green", 0x00FF00},
            {"blue", 0x0000FF},
            {"yellow", 0xFFC800},
            {"magenta", 0xFF00FF},
            {"white", 0xFFFFFF},
        };
        if (name == nullptr)
        {
            return false;
        }
        for (const Entry &entry : colors)
        {
            if (strcmp(entry.name, name) == 0)
            {
                rgb = entry.rgb;
                return true;
            }
        }
        return false;
    }

    inline bool equals(const Pattern &a, const Pattern &b)
    {
        for (size_t i = 0; i < SEGMENT_COUNT; i++)
        {
            if (a.segments[i] != b.segments[i])
            {
                return false;
            }
        }
        return true;
    }

    // Whether a pattern received `elapsedMs` ago, that was due to rotate after `rotatesInMs`, may still be shown.
    inline bool isFresh(uint32_t elapsedMs, uint32_t rotatesInMs)
    {
        return static_cast<uint64_t>(elapsedMs) < static_cast<uint64_t>(rotatesInMs) + STALE_GRACE_MS;
    }

    // Accepts exactly four known colours. Anything else (wrong length, unknown colour) is rejected, so
    // a malformed message never shows a half pattern an admin could mistake for a real one.
    inline bool parse(const std::vector<std::string> &names, Pattern &out)
    {
        if (names.size() != SEGMENT_COUNT)
        {
            return false;
        }
        Pattern parsed;
        for (size_t i = 0; i < SEGMENT_COUNT; i++)
        {
            if (!colorFromName(names[i].c_str(), parsed.segments[i]))
            {
                return false;
            }
        }
        out = parsed;
        return true;
    }

    // Colour of LED `index` out of `ledCount`: four equal segments from index 0 upwards (left to right on a
    // linear strip), the last LED of every segment dark so neighbouring segments stay apart. The 24 LED
    // ring gets 5 lit LEDs and 1 dark one per segment. Segments of a single LED have no room for a gap.
    inline uint32_t pixelColor(const Pattern &pattern, size_t ledCount, size_t index)
    {
        if (ledCount == 0 || index >= ledCount)
        {
            return 0;
        }
        for (size_t segment = 0; segment < SEGMENT_COUNT; segment++)
        {
            const size_t begin = segment * ledCount / SEGMENT_COUNT;
            const size_t end = (segment + 1) * ledCount / SEGMENT_COUNT;
            if (index < begin || index >= end)
            {
                continue;
            }
            const bool lastOfSegment = index + 1 == end;
            if (lastOfSegment && end - begin >= 2)
            {
                return 0;
            }
            return pattern.segments[segment];
        }
        return 0;
    }
}
