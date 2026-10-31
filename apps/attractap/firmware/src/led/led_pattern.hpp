#pragma once

// Colour pattern a Lite reader (LED ring, no screen) shows while it waits for approval. Hardware-free so
// it can be tested on the host, see tests/led-pattern.
//
// Layout and reading order (the admin compares it with the colours in the Attraccess approval dialog):
//   - The ring is split into SEGMENT_COUNT (8) equal segments; the 24 LED ring has 3 LEDs per segment.
//   - Segment 1 starts at LED 0 and the segments follow with rising LED index. LED 0 is wired at the top
//     of the ring and the index rises clockwise, so read the segments clockwise from segment 1 at the top.
//   - Segment 1 blinks (on/off, BLINK_HALF_PERIOD_MS) to mark where the pattern starts; the other
//     segments are steady.
//   - The two outer LEDs of a segment are dimmed so two neighbouring segments of the same colour still
//     read as two segments.
//   - The pattern changes with every round (every 30 s). While the reader has no current pattern
//     (disconnected, or no new round 10 s after the rotation) the ring breathes white instead.

#include <cstddef>
#include <cstdint>

namespace LedPattern
{
    constexpr size_t SEGMENT_COUNT = 8;
    constexpr size_t COLOR_COUNT = 6;
    constexpr uint32_t BLINK_HALF_PERIOD_MS = 500;
    // Brightness (0..255) of the outer LEDs of a segment that has three or more LEDs.
    constexpr uint8_t EDGE_BRIGHTNESS = 90;

    // Colour index 0..5 as sent by the server: red, green, blue, yellow, white, magenta. Orange and cyan
    // are left out because they are hard to tell apart from yellow and white on a WS2812.
    inline bool colorFromIndex(uint8_t index, uint32_t &rgb)
    {
        static const uint32_t colors[COLOR_COUNT] = {
            0xFF0000, // red
            0x00FF00, // green
            0x0000FF, // blue
            0xFFC800, // yellow
            0xFFFFFF, // white
            0xFF00FF, // magenta
        };
        if (index >= COLOR_COUNT)
        {
            return false;
        }
        rgb = colors[index];
        return true;
    }

    // Whether segment 1 is lit at `nowMs`.
    inline bool markerLit(uint32_t nowMs)
    {
        return (nowMs / BLINK_HALF_PERIOD_MS) % 2 == 0;
    }

    inline uint32_t scale(uint32_t rgb, uint8_t brightness)
    {
        const uint32_t r = ((rgb >> 16) & 0xFF) * brightness / 255;
        const uint32_t g = ((rgb >> 8) & 0xFF) * brightness / 255;
        const uint32_t b = (rgb & 0xFF) * brightness / 255;
        return (r << 16) | (g << 8) | b;
    }

    // Colour (0xRRGGBB) of LED `index` out of `ledCount` for `pattern` (SEGMENT_COUNT colour indices).
    // Segment boundaries are ledCount * k / SEGMENT_COUNT, so strips that do not divide evenly still use
    // every LED.
    inline uint32_t pixelColor(const uint8_t *pattern, size_t ledCount, size_t index, uint32_t nowMs)
    {
        if (pattern == nullptr || ledCount == 0 || index >= ledCount)
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
            uint32_t rgb = 0;
            if (segment == 0 && !markerLit(nowMs))
            {
                return 0;
            }
            if (!colorFromIndex(pattern[segment], rgb))
            {
                return 0;
            }
            const bool edge = index == begin || index + 1 == end;
            return (end - begin >= 3 && edge) ? scale(rgb, EDGE_BRIGHTNESS) : rgb;
        }
        return 0;
    }
}
