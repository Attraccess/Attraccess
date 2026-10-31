#pragma once

#ifdef HAS_POWER_BUTTON

#include <lvgl.h>
#include <functional>

// Power-off button + inline confirmation, shared by every settings screen on
// hardware that has the SYS_EN latch (V4 / touch v2). Confirming invokes the
// callback, which the application wires to IOExpander::powerOff().
namespace PowerOffButton
{
    // Adds the button (and its hidden confirm row) to `parent` and returns the button. `onConfirm` is stored in a
    // single global slot — ponytail: all buttons power off the same board, so
    // per-instance state would be dead weight. Give it per-button user data if
    // a screen ever needs a different action.
    lv_obj_t *create(lv_obj_t *parent, std::function<void()> onConfirm);

    // Tapping the button swaps it for a Cancel / Power off row in the same
    // parent. Restores the button if the row is open. Call from onScreenLeave().
    void hideConfirm();
}

#endif // HAS_POWER_BUTTON
