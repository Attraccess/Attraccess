#pragma once

// Firmware-owned feedback patterns for readers without a screen (Lite). Plugins only pick a pattern name;
// they cannot set raw LEDs or sounds. Hardware-free so the pattern to LED/beeper mapping is unit-tested on
// the host (tests/led-pattern).
//
//   blocked      = the existing error flash (red, 600 ms) and an error beep
//   ok           = the existing success flash (green, 400 ms) and a success beep
//   reserved     = steady amber half ring, 3 s, one beep
//   confirm-wait = amber ring draining over the confirm window, one beep at the start
//   warning      = amber blink 1.5 s (allow-with-warning), one beep

#include <cstddef>
#include <cstdint>

namespace LedFeedback
{
    enum class Pattern : uint8_t { Blocked, Ok, Reserved, ConfirmWait, Warning };
    enum class Effect : uint8_t { ErrorFlash, SuccessFlash, AmberHalfRing, AmberRingDrain, AmberBlink };
    enum class Beep : uint8_t { None, Error, Success, Single };

    constexpr uint32_t AMBER = 0xFFA000;
    constexpr uint32_t RESERVED_DURATION_MS = 3000;
    constexpr uint32_t WARNING_DURATION_MS = 1500;
    constexpr uint32_t WARNING_HALF_PERIOD_MS = 250;
    constexpr uint32_t ERROR_FLASH_MS = 100;
    constexpr uint32_t ERROR_FLASH_PHASES = 6;
    constexpr uint32_t SUCCESS_DURATION_MS = 400;

    struct Action
    {
        Effect effect;
        uint32_t durationMs; // for ConfirmWait the confirm window
        Beep beep;
    };

    // What a pattern does. `confirmWindowMs` only matters for ConfirmWait.
    constexpr Action actionFor(Pattern pattern, uint32_t confirmWindowMs = 0)
    {
        switch (pattern)
        {
        case Pattern::Blocked: return {Effect::ErrorFlash, ERROR_FLASH_MS * ERROR_FLASH_PHASES, Beep::Error};
        case Pattern::Ok: return {Effect::SuccessFlash, SUCCESS_DURATION_MS, Beep::Success};
        case Pattern::Reserved: return {Effect::AmberHalfRing, RESERVED_DURATION_MS, Beep::Single};
        case Pattern::ConfirmWait: return {Effect::AmberRingDrain, confirmWindowMs, Beep::Single};
        case Pattern::Warning: return {Effect::AmberBlink, WARNING_DURATION_MS, Beep::Single};
        }
        return {Effect::ErrorFlash, ERROR_FLASH_MS * ERROR_FLASH_PHASES, Beep::Error};
    }

    // Minimal strip interface; Ws2812Strip implements it, tests use a fake.
    class Strip
    {
    public:
        virtual ~Strip() = default;
        virtual uint16_t numPixels() const = 0;
        virtual void setPixelColor(uint16_t index, uint32_t rgb) = 0;
        virtual void show() = 0;
    };

    inline bool finished(const Action &action, uint32_t elapsedMs)
    {
        return elapsedMs >= action.durationMs;
    }

    // Colour (0xRRGGBB) of LED `index` of `count` at `elapsedMs` into the effect; 0 = off.
    inline uint32_t pixelColor(const Action &action, uint32_t elapsedMs, size_t index, size_t count)
    {
        if (count == 0 || index >= count || finished(action, elapsedMs)) return 0;
        switch (action.effect)
        {
        case Effect::ErrorFlash: return ((elapsedMs / ERROR_FLASH_MS) % 2 == 0) ? 0xFF0000 : 0;
        case Effect::SuccessFlash: return 0x00FF00;
        case Effect::AmberHalfRing: return index < (count + 1) / 2 ? AMBER : 0;
        case Effect::AmberRingDrain:
        {
            // Lit LEDs shrink linearly from all to none; the first LED goes out last.
            const uint64_t remaining = action.durationMs - elapsedMs;
            const size_t lit = static_cast<size_t>((remaining * count + action.durationMs - 1) / action.durationMs);
            return index < lit ? AMBER : 0;
        }
        case Effect::AmberBlink: return ((elapsedMs / WARNING_HALF_PERIOD_MS) % 2 == 0) ? AMBER : 0;
        }
        return 0;
    }

    inline void render(Strip &strip, const Action &action, uint32_t elapsedMs)
    {
        const uint16_t n = strip.numPixels();
        for (uint16_t i = 0; i < n; i++) strip.setPixelColor(i, pixelColor(action, elapsedMs, i, n));
        strip.show();
    }
}
