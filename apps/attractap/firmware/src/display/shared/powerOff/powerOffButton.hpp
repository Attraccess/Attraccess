#pragma once

#ifdef HAS_POWER_BUTTON

#include <lvgl.h>
#include <functional>

// Power-off button + inline confirmation, shared by every settings screen on
// hardware that has the SYS_EN latch (V4 / touch v2). Confirming invokes the
// callback, which the application wires to IOExpander::powerOff().
namespace PowerOffButton
{
    // Adds the button (and its hidden confirm) to `parent` and returns the
    // button. Each button keeps its own callback and confirm, so screens that
    // are alive at the same time do not interfere.
    lv_obj_t *create(lv_obj_t *parent, std::function<void()> onConfirm);

    // Tapping the button swaps it for a full-width "Power off device?" confirm
    // with Cancel / Power off. This restores `button` if its confirm is open;
    // nullptr is ignored. Call from the host screen's onScreenLeave().
    void hideConfirm(lv_obj_t *button);
}

#endif // HAS_POWER_BUTTON
