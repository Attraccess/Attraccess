#include "led_feedback.hpp"

#include <cstdio>
#include <vector>

static int failures = 0;
#define CHECK(cond)                                                              \
    do {                                                                         \
        if (!(cond)) { std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } \
    } while (0)

class FakeStrip : public LedFeedback::Strip
{
public:
    explicit FakeStrip(uint16_t n) : px(n, 0) {}
    uint16_t numPixels() const override { return static_cast<uint16_t>(px.size()); }
    void setPixelColor(uint16_t i, uint32_t rgb) override { px[i] = rgb; }
    void show() override { shown++; }
    size_t lit() const { size_t c = 0; for (auto p : px) c += p != 0; return c; }
    std::vector<uint32_t> px;
    int shown = 0;
};

int main()
{
    using namespace LedFeedback;

    // Mapping of pattern names to effects, durations and beeps.
    CHECK(actionFor(Pattern::Blocked).effect == Effect::ErrorFlash && actionFor(Pattern::Blocked).beep == Beep::Error);
    CHECK(actionFor(Pattern::Ok).effect == Effect::SuccessFlash && actionFor(Pattern::Ok).beep == Beep::Success);
    CHECK(actionFor(Pattern::Reserved).durationMs == 3000 && actionFor(Pattern::Reserved).beep == Beep::Single);
    CHECK(actionFor(Pattern::ConfirmWait, 20000).durationMs == 20000);
    CHECK(actionFor(Pattern::Warning).effect == Effect::AmberBlink);

    FakeStrip strip(24);
    // reserved: steady amber on the first half, off afterwards, over 3 s.
    const Action reserved = actionFor(Pattern::Reserved);
    for (uint32_t t : {0u, 1000u, 2999u})
    {
        render(strip, reserved, t);
        CHECK(strip.lit() == 12 && strip.px[0] == AMBER && strip.px[11] == AMBER && strip.px[12] == 0);
    }
    render(strip, reserved, 3000);
    CHECK(strip.lit() == 0);

    // confirm-wait: ring drains over the window.
    const Action wait = actionFor(Pattern::ConfirmWait, 10000);
    render(strip, wait, 0);
    CHECK(strip.lit() == 24);
    render(strip, wait, 5000);
    CHECK(strip.lit() == 12 && strip.px[0] == AMBER);
    render(strip, wait, 9900);
    CHECK(strip.lit() == 1 && strip.px[0] == AMBER);
    render(strip, wait, 10000);
    CHECK(strip.lit() == 0 && finished(wait, 10000));

    // blocked flashes red 3 times, ok is a green flash.
    render(strip, actionFor(Pattern::Blocked), 0);
    CHECK(strip.lit() == 24 && strip.px[3] == 0xFF0000);
    render(strip, actionFor(Pattern::Blocked), 150);
    CHECK(strip.lit() == 0);
    render(strip, actionFor(Pattern::Ok), 100);
    CHECK(strip.lit() == 24 && strip.px[0] == 0x00FF00);
    render(strip, actionFor(Pattern::Ok), 400);
    CHECK(strip.lit() == 0);

    // warning blinks amber.
    render(strip, actionFor(Pattern::Warning), 0);
    CHECK(strip.lit() == 24);
    render(strip, actionFor(Pattern::Warning), 300);
    CHECK(strip.lit() == 0);

    // an odd LED count still lights the first half rounded up, and an empty strip is safe.
    FakeStrip odd(7);
    render(odd, reserved, 0);
    CHECK(odd.lit() == 4);
    FakeStrip none(0);
    render(none, reserved, 0);
    CHECK(none.shown == 1);

    if (failures) return 1;
    std::puts("led feedback ok");
    return 0;
}
