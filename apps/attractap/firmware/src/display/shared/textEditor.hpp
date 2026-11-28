#pragma once

#include <lvgl.h>

#include "../fonts/attractap_fonts.hpp"
#include "../theme.hpp"

// The parts of a full-screen text editor: a themed text area and the on-screen keyboard that writes into it. Used by
// the usage form editor and the maintenance reason screen.
namespace TextEditor
{
    inline lv_obj_t *createTextArea(lv_obj_t *parent)
    {
        lv_obj_t *textArea = lv_textarea_create(parent);
        lv_obj_set_width(textArea, lv_pct(100));
        lv_obj_set_flex_grow(textArea, 1);
        DisplayTheme::field(textArea);
        lv_obj_set_style_text_font(textArea, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
        return textArea;
    }

    // `onEvent` gets LV_EVENT_READY (checkmark) and LV_EVENT_CANCEL (keyboard hide).
    inline lv_obj_t *createKeyboard(lv_obj_t *parent, lv_event_cb_t onEvent, void *userData)
    {
        lv_obj_t *keyboard = lv_keyboard_create(parent);
        DisplayTheme::keyboard(keyboard);
        lv_obj_set_width(keyboard, lv_pct(100));
        lv_obj_set_height(keyboard, lv_pct(45));
        lv_obj_add_event_cb(keyboard, onEvent, LV_EVENT_ALL, userData);
        return keyboard;
    }
}
