#pragma once

#ifdef HAS_POWER_BUTTON

#include <lvgl.h>
#include <functional>

// Power-off button + confirmation modal, shared by every settings screen on
// hardware that has the SYS_EN latch (V4 / touch v2). Confirming invokes the
// callback, which the application wires to IOExpander::powerOff().
namespace PowerOffButton
{
    // Adds the button to `parent` and returns it. `onConfirm` is stored in a
    // single global slot — ponytail: all buttons power off the same board, so
    // per-instance state would be dead weight. Give it per-button user data if
    // a screen ever needs a different action.
    lv_obj_t *create(lv_obj_t *parent, std::function<void()> onConfirm);

    // Closes the modal if open. Call from onScreenLeave().
    void hideConfirm();

    // True while the confirm modal is up. The drawer gesture is not LVGL
    // hit-tested, so Display::handleGestureSample() has to check this itself —
    // otherwise a top-edge swipe opens the drawer behind the modal, invisibly.
    bool isConfirmVisible();
}

#endif // HAS_POWER_BUTTON
