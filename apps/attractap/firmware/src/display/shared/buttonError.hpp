#pragma once

#include <lvgl.h>

#include <functional>

#include "../i18n.hpp"

// In-place error state for the button that triggered a failing request. A
// button-shaped skin lies over the button, so the button keeps its exact size
// and position and nothing else on the screen moves; whatever the screen does
// to the button underneath (refreshed captions, colours) cannot clobber it.
// The skin shows "⚠ <text>" and goes after a few seconds, when the button is
// pressed again or when the owner clears it on screen leave.
//
// A press takes the skin away on LV_EVENT_PRESSED, which LVGL always sends
// before LV_EVENT_CLICKED: the click that follows reaches the button's own
// handler unchanged, so tapping the error performs the button's normal action
// (a retry). Owners rely on that order.
class ButtonError {
public:
    static constexpr uint32_t DurationMs = 4000;

    // `text` is shown on one line after a warning sign, in the largest of 18, 16
    // and 14 px that fits. When even 14 px is too wide, a button with room for two
    // lines (a list row) wraps it; beyond that it is truncated with dots.
    // `onPress` runs when a press takes the error away (before the click that retries).
    void show(lv_obj_t *button, const FirmwareI18n::Text &text, uint32_t durationMs = DurationMs,
              std::function<void()> onPress = nullptr);
    void clear();
    lv_obj_t *target() const { return button; }

private:
    lv_obj_t *button = nullptr;
    lv_obj_t *skin = nullptr;
    lv_timer_t *timer = nullptr;
    std::function<void()> pressed;

    static void onPressed(lv_event_t *e);
    static void onDeleted(lv_event_t *e);
    void forget();
};
