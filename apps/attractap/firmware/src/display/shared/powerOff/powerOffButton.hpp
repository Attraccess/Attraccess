#pragma once

#ifdef HAS_POWER_BUTTON

#include <lvgl.h>
#include <functional>

#include "../../screens/confirm/confirmScreen.hpp"

// Power-off button, shared by every settings screen on hardware that has the
// SYS_EN latch (V4 / touch v2). Tapping it asks for confirmation on a
// full-screen ConfirmScreen; confirming invokes the callback, which the
// application wires to IOExpander::powerOff().
namespace PowerOffButton
{
    // Adds the button to `parent` and returns it. `onConfirm` is stored in a
    // single global slot — ponytail: all buttons power off the same board, so
    // per-instance state would be dead weight. Give it per-button user data if
    // a screen ever needs a different action.
    lv_obj_t *create(lv_obj_t *parent, std::function<void()> onConfirm);

    // How the confirmation is shown and left again: Display routes it to its
    // ConfirmScreen. The screens do not know the router.
    void setConfirmPresenter(std::function<void(ConfirmScreen::Config)> present, std::function<void()> returnToOrigin);
}

#endif // HAS_POWER_BUTTON
