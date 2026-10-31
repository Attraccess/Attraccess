#pragma once

#include <lvgl.h>

#include "../../i18n.hpp"

// A confirm step that takes the place of the action it guards, inside the
// screen or panel that owns that action: a title, an optional message and a
// footer with a secondary Cancel followed by the danger action. Everything is
// centered. Created hidden; the owner swaps it in and out with LV_OBJ_FLAG_HIDDEN.
struct InlineConfirm
{
    lv_obj_t *root = nullptr;
    // Title and message. Let it grow to pin the footer to the bottom of a fixed-height root.
    lv_obj_t *body = nullptr;
    lv_obj_t *footer = nullptr;
    lv_obj_t *cancelButton = nullptr;
    lv_obj_t *confirmButton = nullptr;

    // `userData` is passed to both click callbacks.
    static InlineConfirm create(lv_obj_t *parent, const FirmwareI18n::Text &title, const FirmwareI18n::Text &message,
                                const FirmwareI18n::Text &confirmText, lv_event_cb_t onCancel, lv_event_cb_t onConfirm,
                                void *userData);
};
