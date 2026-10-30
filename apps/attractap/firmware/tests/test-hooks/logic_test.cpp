// Touch gesture scripting and screenshot encoding for the serial test hooks.
#include "testhooks/frame_encoding.hpp"
#include "testhooks/touch_injector.hpp"

#include <cstdio>
#include <cstring>
#include <random>
#include <string>
#include <vector>

static int failures = 0;

#define CHECK(condition)                                                    \
    do                                                                      \
    {                                                                       \
        if (!(condition))                                                   \
        {                                                                   \
            std::fprintf(stderr, "%s:%d: CHECK(%s)\n", __FILE__, __LINE__, #condition); \
            failures++;                                                     \
        }                                                                   \
    } while (0)

using Sample = TouchInjector::Sample;

static bool sampleAt(TouchInjector &touch, uint32_t now, Sample &out)
{
    return touch.sample(now, out);
}

static void tapHoldsThenReleases()
{
    TouchInjector touch;
    Sample s{};
    CHECK(!touch.sample(0, s));
    CHECK(touch.tap(100, 200, 60));
    CHECK(touch.busy());
    CHECK(touch.plannedDurationMs() == 60 + TouchInjector::RELEASE_MS);
    CHECK(sampleAt(touch, 1000, s) && s.pressed && s.x == 100 && s.y == 200);
    CHECK(sampleAt(touch, 1030, s) && s.pressed);
    CHECK(sampleAt(touch, 1060, s) && s.pressed); // hold time reached: last press read
    CHECK(sampleAt(touch, 1070, s) && !s.pressed && s.x == 100);
    CHECK(sampleAt(touch, 1110, s) && !s.pressed);
    CHECK(!touch.busy());
    CHECK(!touch.sample(1120, s)); // back to the real panel
}

static void slowReadsStillSeeEveryStep()
{
    // A render frame can delay reads far beyond a step's duration: the press
    // and the release must each still reach LVGL.
    TouchInjector touch;
    Sample s{};
    CHECK(touch.tap(5, 6, 60));
    CHECK(sampleAt(touch, 0, s) && s.pressed);
    CHECK(sampleAt(touch, 500, s) && s.pressed);
    CHECK(sampleAt(touch, 1000, s) && !s.pressed); // release starts at this read
    CHECK(sampleAt(touch, 1500, s) && !s.pressed);
    CHECK(!touch.sample(2000, s));
}

static void rejectsOverlappingGestures()
{
    TouchInjector touch;
    Sample s{};
    CHECK(touch.tap(1, 1, 60));
    CHECK(!touch.tap(2, 2, 60));
    CHECK(!touch.swipe(0, 0, 9, 9, 100));
    touch.cancel();
    CHECK(!touch.busy());
    CHECK(!touch.sample(0, s));
    CHECK(touch.tap(2, 2, 60));
}

static void swipeMovesLinearly()
{
    TouchInjector touch;
    Sample s{};
    CHECK(touch.swipe(100, 400, 100, 0, 200));
    CHECK(sampleAt(touch, 0, s) && s.pressed && s.y == 400);
    CHECK(sampleAt(touch, TouchInjector::SWIPE_SETTLE_MS, s) && s.y == 400); // settle done
    uint32_t moveStart = TouchInjector::SWIPE_SETTLE_MS + 1;
    CHECK(sampleAt(touch, moveStart, s) && s.pressed && s.y == 400);
    CHECK(sampleAt(touch, moveStart + 100, s) && s.pressed && s.y == 200 && s.x == 100);
    CHECK(sampleAt(touch, moveStart + 200, s) && s.pressed && s.y == 0); // move ends on target
    uint32_t settle = moveStart + 201;
    CHECK(sampleAt(touch, settle, s) && s.pressed && s.y == 0);
    CHECK(sampleAt(touch, settle + TouchInjector::SWIPE_SETTLE_MS, s) && s.pressed);
    CHECK(sampleAt(touch, settle + 40, s) && !s.pressed && s.y == 0);
    CHECK(sampleAt(touch, settle + 40 + TouchInjector::RELEASE_MS, s) && !s.pressed);
    CHECK(!touch.busy());
}

static void openPressWaitsForRelease()
{
    TouchInjector touch;
    Sample s{};
    CHECK(!touch.release());
    CHECK(touch.press(50, 60, 0));
    CHECK(!touch.holding()); // not yet seen by LVGL
    CHECK(touch.plannedDurationMs() == TouchInjector::RELEASE_MS);
    CHECK(sampleAt(touch, 0, s) && s.pressed);
    CHECK(touch.holding());
    CHECK(sampleAt(touch, 30000, s) && s.pressed);
    CHECK(!touch.tap(1, 1, 60));
    CHECK(touch.release());
    CHECK(!touch.release());
    CHECK(sampleAt(touch, 30010, s) && s.pressed); // the hold ends at this read
    CHECK(sampleAt(touch, 30020, s) && !s.pressed);
    CHECK(sampleAt(touch, 30060, s) && !s.pressed);
    CHECK(!touch.busy());
}

static void openPressEndsAfterMaxHold()
{
    TouchInjector touch;
    Sample s{};
    CHECK(touch.press(1, 2, 0));
    CHECK(sampleAt(touch, 0, s) && s.pressed);
    CHECK(sampleAt(touch, TouchInjector::MAX_HOLD_MS, s) && s.pressed);
    CHECK(sampleAt(touch, TouchInjector::MAX_HOLD_MS + 1, s) && !s.pressed);
}

static void timedPressIsALongPress()
{
    TouchInjector touch;
    Sample s{};
    CHECK(touch.press(1, 2, 1500));
    CHECK(touch.plannedDurationMs() == 1500 + TouchInjector::RELEASE_MS);
    CHECK(sampleAt(touch, 0, s) && s.pressed);
    CHECK(sampleAt(touch, 1499, s) && s.pressed);
    CHECK(!touch.holding());
    CHECK(sampleAt(touch, 1500, s) && s.pressed);
    CHECK(sampleAt(touch, 1510, s) && !s.pressed);
}

// Mirror of the host decoder in attractap_lab/reader_screen.py.
static std::vector<uint16_t> decodeRle565(const uint8_t *data, size_t size)
{
    std::vector<uint16_t> pixels;
    size_t i = 0;
    while (i < size)
    {
        uint8_t control = data[i++];
        if (control < 128)
        {
            for (int n = 0; n <= control; n++, i += 2)
            {
                pixels.push_back(static_cast<uint16_t>(data[i] | (data[i + 1] << 8)));
            }
        }
        else
        {
            uint16_t pixel = static_cast<uint16_t>(data[i] | (data[i + 1] << 8));
            i += 2;
            pixels.insert(pixels.end(), control - 126, pixel);
        }
    }
    return pixels;
}

static void roundTrip(const std::vector<uint16_t> &pixels)
{
    std::vector<uint8_t> encoded(FrameEncoding::maxRle565Size(pixels.size()) + 1, 0xEE);
    size_t size = FrameEncoding::encodeRle565(pixels.data(), pixels.size(), encoded.data());
    CHECK(size <= FrameEncoding::maxRle565Size(pixels.size()));
    CHECK(encoded[FrameEncoding::maxRle565Size(pixels.size())] == 0xEE); // no overrun
    CHECK(decodeRle565(encoded.data(), size) == pixels);
}

static void rleEncodesRunsAndLiterals()
{
    const uint16_t run[] = {0x1234, 0x1234, 0x1234};
    uint8_t out[16];
    CHECK(FrameEncoding::encodeRle565(run, 3, out) == 3);
    CHECK(out[0] == 129 && out[1] == 0x34 && out[2] == 0x12);

    const uint16_t literal[] = {1, 2};
    CHECK(FrameEncoding::encodeRle565(literal, 2, out) == 5);
    CHECK(out[0] == 1 && out[1] == 1 && out[2] == 0 && out[3] == 2 && out[4] == 0);

    // A flat 480x480 frame: 1787 runs (the last one short), 3 bytes each.
    std::vector<uint16_t> flat(480 * 480, 0x18E4);
    std::vector<uint8_t> encoded(FrameEncoding::maxRle565Size(flat.size()));
    size_t size = FrameEncoding::encodeRle565(flat.data(), flat.size(), encoded.data());
    CHECK(size == (flat.size() + 128) / 129 * 3);

    roundTrip({});
    roundTrip({7});
    roundTrip({7, 7});
    roundTrip({1, 2, 2, 3, 3, 3, 4});
    roundTrip(std::vector<uint16_t>(300, 9));
    std::vector<uint16_t> noise(5000);
    std::mt19937 random(42);
    for (uint16_t &pixel : noise)
    {
        pixel = static_cast<uint16_t>(random() % 4); // mixes runs and literals
    }
    roundTrip(noise);
    for (uint16_t &pixel : noise)
    {
        pixel = static_cast<uint16_t>(random()); // worst case: all literal
    }
    roundTrip(noise);
}

static void crcAndBase64MatchZlibAndRfc4648()
{
    const char *check = "123456789";
    CHECK(FrameEncoding::crc32(reinterpret_cast<const uint8_t *>(check), 9) == 0xCBF43926u);
    uint32_t part = FrameEncoding::crc32(reinterpret_cast<const uint8_t *>(check), 4);
    CHECK(FrameEncoding::crc32(reinterpret_cast<const uint8_t *>(check) + 4, 5, part) == 0xCBF43926u);
    CHECK(FrameEncoding::crc32(nullptr, 0) == 0);

    const char *inputs[] = {"", "f", "fo", "foo", "foob", "fooba", "foobar"};
    const char *outputs[] = {"", "Zg==", "Zm8=", "Zm9v", "Zm9vYg==", "Zm9vYmE=", "Zm9vYmFy"};
    for (size_t i = 0; i < 7; i++)
    {
        char out[16];
        size_t length = std::strlen(inputs[i]);
        size_t written = FrameEncoding::base64Encode(reinterpret_cast<const uint8_t *>(inputs[i]), length, out);
        CHECK(written == FrameEncoding::base64Size(length));
        CHECK(std::string(out) == outputs[i]);
    }
}

int main()
{
    tapHoldsThenReleases();
    slowReadsStillSeeEveryStep();
    rejectsOverlappingGestures();
    swipeMovesLinearly();
    openPressWaitsForRelease();
    openPressEndsAfterMaxHold();
    timedPressIsALongPress();
    rleEncodesRunsAndLiterals();
    crcAndBase64MatchZlibAndRfc4648();
    if (failures)
    {
        std::fprintf(stderr, "%d check(s) failed\n", failures);
        return 1;
    }
    std::puts("PASS: touch gestures and screenshot encoding");
    return 0;
}
