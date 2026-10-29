#include "touch_injector.hpp"

bool TouchInjector::begin()
{
    if (busy())
    {
        return false;
    }
    count = 0;
    current = 0;
    stepStarted = false;
    return true;
}

void TouchInjector::push(int16_t x1, int16_t y1, int16_t x2, int16_t y2, uint32_t durationMs, bool pressed, bool openEnded)
{
    if (count < MAX_STEPS)
    {
        steps[count++] = Step{x1, y1, x2, y2, durationMs, pressed, openEnded};
    }
}

bool TouchInjector::tap(int16_t x, int16_t y, uint32_t holdMs)
{
    if (!begin())
    {
        return false;
    }
    push(x, y, x, y, holdMs, true);
    push(x, y, x, y, RELEASE_MS, false);
    return true;
}

bool TouchInjector::press(int16_t x, int16_t y, uint32_t holdMs)
{
    if (!begin())
    {
        return false;
    }
    push(x, y, x, y, holdMs, true, holdMs == 0);
    push(x, y, x, y, RELEASE_MS, false);
    return true;
}

bool TouchInjector::swipe(int16_t x1, int16_t y1, int16_t x2, int16_t y2, uint32_t durationMs)
{
    if (!begin())
    {
        return false;
    }
    push(x1, y1, x1, y1, SWIPE_SETTLE_MS, true);
    push(x1, y1, x2, y2, durationMs, true);
    // Holding still at the end lets a test choose between a drag (long
    // duration, no throw) and a flick (short duration) without LVGL
    // seeing the release before the last move.
    push(x2, y2, x2, y2, SWIPE_SETTLE_MS, true);
    push(x2, y2, x2, y2, RELEASE_MS, false);
    return true;
}

bool TouchInjector::release()
{
    if (!busy() || !steps[current].openEnded)
    {
        return false;
    }
    // Ends the hold at the next read; the queued release step follows.
    steps[current].openEnded = false;
    steps[current].durationMs = 0;
    return true;
}

void TouchInjector::cancel()
{
    count = 0;
    current = 0;
    stepStarted = false;
}

bool TouchInjector::holding() const
{
    return busy() && steps[current].openEnded && stepStarted;
}

uint32_t TouchInjector::plannedDurationMs() const
{
    uint32_t total = 0;
    for (size_t i = current; i < count; i++)
    {
        total += steps[i].openEnded ? 0 : steps[i].durationMs;
    }
    return total;
}

static int16_t interpolate(int16_t from, int16_t to, uint32_t elapsed, uint32_t duration)
{
    if (duration == 0 || elapsed >= duration)
    {
        return to;
    }
    int32_t delta = static_cast<int32_t>(to) - from;
    return static_cast<int16_t>(from + delta * static_cast<int32_t>(elapsed) / static_cast<int32_t>(duration));
}

bool TouchInjector::sample(uint32_t nowMs, Sample &out)
{
    if (!busy())
    {
        return false;
    }

    Step &step = steps[current];
    if (!stepStarted)
    {
        stepStarted = true;
        stepStartMs = nowMs;
    }
    uint32_t elapsed = nowMs - stepStartMs;
    uint32_t duration = step.openEnded ? MAX_HOLD_MS : step.durationMs;

    out.x = interpolate(step.x1, step.x2, elapsed, duration);
    out.y = interpolate(step.y1, step.y2, elapsed, duration);
    out.pressed = step.pressed;

    // This read delivered the step at least once; advance once its time is up.
    if (elapsed >= duration)
    {
        current++;
        stepStarted = false;
    }
    return true;
}
