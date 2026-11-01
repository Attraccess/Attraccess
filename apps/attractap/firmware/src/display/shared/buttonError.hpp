#pragma once

#include <lvgl.h>

#include "../i18n.hpp"

// In-place error state for the button that triggered a failing request. A
// button-shaped skin lies over the button, so the button keeps its exact size
// and position and nothing else on the screen moves; whatever the screen does
// to the button underneath (refreshed captions, colours) cannot clobber it.
// The skin goes after a few seconds, when the button is pressed again (the press
// then performs the button's normal action, i.e. a retry) or when the owner
// clears it on screen leave.
class ButtonError {
public:
    static constexpr uint32_t DurationMs = 4000;

    // `text` is shown on one line, truncated with dots when it is too long.
    void show(lv_obj_t *button, const FirmwareI18n::Text &text, uint32_t durationMs = DurationMs);
    void clear();
    lv_obj_t *target() const { return button; }
    bool active() const { return button != nullptr; }

private:
    lv_obj_t *button = nullptr;
    lv_obj_t *skin = nullptr;
    lv_obj_t *registeredOn = nullptr; // button that already forwards its events here
    lv_timer_t *timer = nullptr;

    static void onButtonEvent(lv_event_t *e);
};
