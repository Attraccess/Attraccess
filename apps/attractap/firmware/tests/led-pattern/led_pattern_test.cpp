#include "led_pattern.hpp"

#include <cstdio>
#include <string>
#include <vector>

static int failures = 0;

#define CHECK(condition)                                                          \
    do                                                                            \
    {                                                                             \
        if (!(condition))                                                         \
        {                                                                         \
            std::printf("FAILED %s:%d: %s\n", __FILE__, __LINE__, #condition);    \
            failures++;                                                           \
        }                                                                         \
    } while (0)

static LedPattern::Pattern parsed(const std::vector<std::string> &names)
{
    LedPattern::Pattern pattern{};
    CHECK(LedPattern::parse(names, pattern));
    return pattern;
}

static void colourNames()
{
    const char *names[] = {"red", "green", "blue", "yellow", "magenta", "white"};
    uint32_t seen[6];
    for (int i = 0; i < 6; i++)
    {
        CHECK(LedPattern::colorFromName(names[i], seen[i]));
        CHECK(seen[i] != 0);
        for (int j = 0; j < i; j++)
        {
            CHECK(seen[i] != seen[j]);
        }
    }
    uint32_t rgb = 0;
    CHECK(LedPattern::colorFromName("red", rgb) && rgb == 0xFF0000);
    CHECK(LedPattern::colorFromName("green", rgb) && rgb == 0x00FF00);
    CHECK(LedPattern::colorFromName("blue", rgb) && rgb == 0x0000FF);
    CHECK(!LedPattern::colorFromName("orange", rgb));
    CHECK(!LedPattern::colorFromName("cyan", rgb));
    CHECK(!LedPattern::colorFromName("RED", rgb));
    CHECK(!LedPattern::colorFromName("", rgb));
    CHECK(!LedPattern::colorFromName(nullptr, rgb));
}

static void parsing()
{
    LedPattern::Pattern pattern{};
    CHECK(LedPattern::parse({"red", "green", "blue", "yellow"}, pattern));
    CHECK(pattern.segments[0] == 0xFF0000 && pattern.segments[2] == 0x0000FF);

    LedPattern::Pattern untouched{{1, 2, 3, 4}};
    CHECK(!LedPattern::parse({}, untouched));
    CHECK(!LedPattern::parse({"red", "green", "blue"}, untouched));
    CHECK(!LedPattern::parse({"red", "green", "blue", "yellow", "white"}, untouched));
    CHECK(!LedPattern::parse({"red", "green", "blue", "purple"}, untouched));
    CHECK(untouched.segments[0] == 1 && untouched.segments[3] == 4);
}

static void ringLayout()
{
    const LedPattern::Pattern pattern = parsed({"red", "green", "blue", "yellow"});
    const uint32_t expected[4] = {0xFF0000, 0x00FF00, 0x0000FF, 0xFFC800};
    for (size_t i = 0; i < 24; i++)
    {
        const size_t segment = i / 6;
        const uint32_t color = LedPattern::pixelColor(pattern, 24, i);
        if (i % 6 == 5)
        {
            CHECK(color == 0); // one dark LED between segments, also between segment 4 and 1
        }
        else
        {
            CHECK(color == expected[segment]);
        }
    }
    CHECK(LedPattern::pixelColor(pattern, 24, 24) == 0);
}

static void scalesToOtherLedCounts()
{
    const LedPattern::Pattern pattern = parsed({"red", "green", "blue", "yellow"});
    const uint32_t expected[4] = {0xFF0000, 0x00FF00, 0x0000FF, 0xFFC800};
    for (size_t count : {8u, 12u, 16u, 30u, 60u, 10u})
    {
        size_t dark = 0;
        uint32_t order[4];
        size_t orderSize = 0;
        for (size_t i = 0; i < count; i++)
        {
            const uint32_t color = LedPattern::pixelColor(pattern, count, i);
            if (color == 0)
            {
                dark++;
            }
            else if (orderSize == 0 || order[orderSize - 1] != color)
            {
                CHECK(orderSize < 4);
                order[orderSize++] = color;
            }
        }
        CHECK(dark == 4); // exactly one gap per segment
        CHECK(orderSize == 4);
        for (size_t s = 0; s < orderSize && s < 4; s++)
        {
            CHECK(order[s] == expected[s]); // left to right on a linear strip
        }
        CHECK(LedPattern::pixelColor(pattern, count, 0) == 0xFF0000);
    }
}

static void tinyStrips()
{
    const LedPattern::Pattern pattern = parsed({"red", "green", "blue", "yellow"});
    // one LED per segment: no room for a gap, every LED shows its colour
    CHECK(LedPattern::pixelColor(pattern, 4, 0) == 0xFF0000);
    CHECK(LedPattern::pixelColor(pattern, 4, 3) == 0xFFC800);
    // a segment of a single LED keeps its colour, longer ones still get their gap
    CHECK(LedPattern::pixelColor(pattern, 7, 0) == 0xFF0000);
    CHECK(LedPattern::pixelColor(pattern, 7, 1) == 0x00FF00);
    CHECK(LedPattern::pixelColor(pattern, 7, 2) == 0);
    // fewer LEDs than segments never reads out of range
    CHECK(LedPattern::pixelColor(pattern, 0, 0) == 0);
    // three LEDs: the first segment is empty, the other three show one LED each
    CHECK(LedPattern::pixelColor(pattern, 3, 0) == 0x00FF00);
    CHECK(LedPattern::pixelColor(pattern, 3, 2) == 0xFFC800);
    CHECK(LedPattern::pixelColor(pattern, 3, 3) == 0);
}

static void comparingAndStaleness()
{
    const LedPattern::Pattern a = parsed({"red", "green", "blue", "yellow"});
    const LedPattern::Pattern b = parsed({"red", "green", "blue", "white"});
    CHECK(LedPattern::equals(a, a));
    CHECK(!LedPattern::equals(a, b));

    uint32_t rgb = 0;
    CHECK(LedPattern::colorFromName("magenta", rgb) && rgb == 0xFF00FF);
    CHECK(LedPattern::colorFromName("white", rgb) && rgb == 0xFFFFFF);

    // shown until the rotation was due plus the grace, then the ring breathes white
    CHECK(LedPattern::isFresh(0, 30000));
    CHECK(LedPattern::isFresh(30000 + LedPattern::STALE_GRACE_MS - 1, 30000));
    CHECK(!LedPattern::isFresh(30000 + LedPattern::STALE_GRACE_MS, 30000));
    CHECK(LedPattern::isFresh(0xFFFFFFFFu, 0xFFFFFFFFu));
}

int main()
{
    colourNames();
    parsing();
    ringLayout();
    scalesToOtherLedCounts();
    tinyStrips();
    comparingAndStaleness();
    if (failures != 0)
    {
        std::printf("%d check(s) failed\n", failures);
        return 1;
    }
    std::printf("led pattern tests passed\n");
    return 0;
}
