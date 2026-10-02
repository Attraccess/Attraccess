#pragma once

#include "display/i18n.hpp"

#include "display/theme.hpp"

namespace ReaderHeader {
// Header controls fill the row height, so the default pressed-state growth
// would be clipped by their parent. Keep the touch target and outline stable.
inline void keepButtonInBounds(lv_obj_t *button) {
    lv_obj_set_style_transform_width(button, 0, LV_STATE_PRESSED);
    lv_obj_set_style_transform_height(button, 0, LV_STATE_PRESSED);
}

inline lv_obj_t *createBackButton(lv_obj_t *parent, lv_event_cb_t callback, void *userData) {
    auto *button = lv_button_create(parent);
    DisplayTheme::secondaryButton(button);
    keepButtonInBounds(button);
    lv_obj_set_size(button, 46, 46);
    lv_obj_set_style_pad_all(button, 0, 0);
    auto *icon = lv_label_create(button);
    // LVGL's bundled icon glyph, not an ASCII angle bracket.
    lv_obj_set_style_text_font(icon, &lv_font_montserrat_24, 0);
    FirmwareI18n::setLabel(icon, LV_SYMBOL_LEFT);
    lv_obj_center(icon);
    lv_obj_add_event_cb(button, callback, LV_EVENT_CLICKED, userData);
    return button;
}
}
