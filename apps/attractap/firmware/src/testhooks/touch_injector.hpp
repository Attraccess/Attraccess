#pragma once

#include <cstddef>
#include <cstdint>

// Scripted pointer input for hardware-in-the-loop tests (ATTRACTAP_TEST_HOOKS).
//
// A gesture is a short list of steps. The LVGL touch read callback asks
// sample() for the current point; while a gesture runs it replaces the real
// touch panel, so LVGL sees an ordinary finger. Every step lasts at least its
// duration AND at least one read, so a slow render frame cannot swallow a
// press or a release.
//
// Not thread-safe: callers serialize access (the firmware holds lv_lock).
class TouchInjector
{
public:
    struct Sample
    {
        int16_t x;
        int16_t y;
        bool pressed;
    };

    // An open-ended press ends by itself after this, so a test that never
    // sends release cannot leave the panel pressed forever.
    static constexpr uint32_t MAX_HOLD_MS = 60000;
    static constexpr uint32_t RELEASE_MS = 40;
    static constexpr uint32_t SWIPE_SETTLE_MS = 30;

    // Each returns false if another gesture is still queued or running.
    bool tap(int16_t x, int16_t y, uint32_t holdMs);
    // holdMs == 0 keeps the finger down until release() (capped at MAX_HOLD_MS).
    bool press(int16_t x, int16_t y, uint32_t holdMs);
    bool swipe(int16_t x1, int16_t y1, int16_t x2, int16_t y2, uint32_t durationMs);
    // Lifts the finger of an open-ended press. Returns false if none is held.
    bool release();
    void cancel();

    // Returns true while a gesture runs; `out` is then the injected point.
    // Returns false when idle: the caller reads the real touch panel.
    bool sample(uint32_t nowMs, Sample &out);

    bool busy() const { return current < count; }
    // True once an open-ended press has reached LVGL and is being held.
    bool holding() const;
    // Upper bound for how long the queued gesture still runs, ignoring open holds.
    uint32_t plannedDurationMs() const;

private:
    struct Step
    {
        int16_t x1, y1, x2, y2;
        uint32_t durationMs;
        bool pressed;
        bool openEnded;
    };

    static constexpr size_t MAX_STEPS = 4;
    Step steps[MAX_STEPS]{};
    size_t count = 0;
    size_t current = 0;
    bool stepStarted = false;
    uint32_t stepStartMs = 0;

    bool begin();
    void push(int16_t x1, int16_t y1, int16_t x2, int16_t y2, uint32_t durationMs, bool pressed, bool openEnded = false);
};
