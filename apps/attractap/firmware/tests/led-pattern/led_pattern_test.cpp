#include "led_pattern.hpp"

#include <cstdio>
#include <cstdlib>
#include <initializer_list>

static int failures = 0;

#define CHECK(cond)                                                              \
    do                                                                           \
    {                                                                            \
        if (!(cond))                                                             \
        {                                                                        \
            std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
            failures++;                                                          \
        }                                                                        \
    } while (0)

int main()
{
    using namespace LedPattern;

    // Colour indices map to the six agreed colours, anything else is rejected.
    const uint32_t expected[COLOR_COUNT] = {0xFF0000, 0x00FF00, 0x0000FF, 0xFFC800, 0xFFFFFF, 0xFF00FF};
    for (uint8_t i = 0; i < COLOR_COUNT; i++)
    {
        uint32_t rgb = 0;
        CHECK(colorFromIndex(i, rgb) && rgb == expected[i]);
    }
    uint32_t rgb = 7;
    CHECK(!colorFromIndex(COLOR_COUNT, rgb) && rgb == 7);
    CHECK(!colorFromIndex(255, rgb));

    // 24 LED ring: 8 segments of 3 LEDs, centre LED at full colour, edges dimmed.
    const uint8_t pattern[SEGMENT_COUNT] = {0, 1, 2, 3, 4, 5, 0, 1};
    const uint32_t lit = 0; // segment 1 lit
    for (size_t segment = 1; segment < SEGMENT_COUNT; segment++)
    {
        uint32_t full = 0;
        CHECK(colorFromIndex(pattern[segment], full));
        CHECK(pixelColor(pattern, 24, segment * 3 + 1, lit) == full);
        CHECK(pixelColor(pattern, 24, segment * 3, lit) == scale(full, EDGE_BRIGHTNESS));
        CHECK(pixelColor(pattern, 24, segment * 3 + 2, lit) == scale(full, EDGE_BRIGHTNESS));
    }
    // Reading order: the segments follow with rising LED index, starting at LED 0.
    CHECK(pixelColor(pattern, 24, 0, lit) == scale(0xFF0000, EDGE_BRIGHTNESS));
    CHECK(pixelColor(pattern, 24, 1, lit) == 0xFF0000);
    CHECK(pixelColor(pattern, 24, 4, lit) == 0x00FF00);
    CHECK(pixelColor(pattern, 24, 22, lit) == 0x00FF00);

    // Segment 1 blinks to mark the start, the others never do.
    CHECK(markerLit(0) && !markerLit(BLINK_HALF_PERIOD_MS) && markerLit(2 * BLINK_HALF_PERIOD_MS));
    for (size_t led = 0; led < 24; led++)
    {
        const uint32_t on = pixelColor(pattern, 24, led, 0);
        const uint32_t off = pixelColor(pattern, 24, led, BLINK_HALF_PERIOD_MS);
        if (led < 3)
        {
            CHECK(on != 0 && off == 0);
        }
        else
        {
            CHECK(on != 0 && on == off);
        }
    }

    // Every pattern colour reaches the ring, a different pattern changes it.
    const uint8_t other[SEGMENT_COUNT] = {1, 1, 1, 1, 1, 1, 1, 1};
    bool differs = false;
    for (size_t led = 0; led < 24; led++)
    {
        differs = differs || pixelColor(pattern, 24, led, 0) != pixelColor(other, 24, led, 0);
    }
    CHECK(differs);

    // Same-colour neighbours stay apart: the dimmed edges separate them.
    CHECK(pixelColor(other, 24, 5, 0) < pixelColor(other, 24, 4, 0));
    CHECK(pixelColor(other, 24, 6, 0) < pixelColor(other, 24, 7, 0));

    // Other strip lengths: every LED belongs to a segment, 8 LEDs get one LED per segment, undivisible
    // lengths still use all LEDs and never index past the pattern.
    for (size_t count : {size_t(8), size_t(12), size_t(16), size_t(30), size_t(7)})
    {
        size_t litLeds = 0;
        for (size_t led = 0; led < count; led++)
        {
            litLeds += pixelColor(pattern, count, led, 0) != 0 ? 1 : 0;
        }
        CHECK(litLeds == count);
    }
    CHECK(pixelColor(pattern, 8, 3, 0) == 0xFFC800); // one full-colour LED per segment

    // Defensive: no pattern, no LEDs, out of range, invalid colour index.
    CHECK(pixelColor(nullptr, 24, 5, 0) == 0);
    CHECK(pixelColor(pattern, 0, 0, 0) == 0);
    CHECK(pixelColor(pattern, 24, 24, 0) == 0);
    const uint8_t invalid[SEGMENT_COUNT] = {9, 9, 9, 9, 9, 9, 9, 9};
    CHECK(pixelColor(invalid, 24, 10, 0) == 0);

    if (failures != 0)
    {
        std::fprintf(stderr, "%d check(s) failed\n", failures);
        return EXIT_FAILURE;
    }
    std::puts("PASS: led pattern");
    return EXIT_SUCCESS;
}
