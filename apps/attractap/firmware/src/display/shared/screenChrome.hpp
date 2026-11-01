#pragma once

#include <lvgl.h>

#include "../theme.hpp"

// The chrome on the top layer stays visible on every screen except the session
// summary: the drawer grabber and network badge (top right, y 12-42) above, the
// device footer (y 458-470) below. Full-screen layouts keep their content inside
// these insets.
namespace ScreenChrome
{
    constexpr int32_t Top = 48;
    constexpr int32_t Side = 16;
    constexpr int32_t Bottom = 28;
    constexpr int32_t ContentWidth = 480 - 2 * Side;

    inline void applyInsets(lv_obj_t *obj)
    {
        lv_obj_set_style_pad_top(obj, Top, LV_PART_MAIN);
        lv_obj_set_style_pad_left(obj, Side, LV_PART_MAIN);
        lv_obj_set_style_pad_right(obj, Side, LV_PART_MAIN);
        lv_obj_set_style_pad_bottom(obj, Bottom, LV_PART_MAIN);
    }

    // A one-line label that truncates with dots. Dot truncation measures the label when its
    // text is set, so the label gets its pixel size, and a layout pass, before the text.
    inline lv_obj_t *createOneLineLabel(lv_obj_t *parent, int32_t width, const lv_font_t *font)
    {
        lv_obj_t *label = lv_label_create(parent);
        lv_obj_set_style_text_font(label, font, 0);
        lv_obj_set_size(label, width, lv_font_get_line_height(font));
        lv_obj_update_layout(label);
        lv_label_set_long_mode(label, LV_LABEL_LONG_DOT);
        return label;
    }

    // Base of a routed full-screen layout: themed background, no scrolling, insets.
    inline lv_obj_t *createScreen()
    {
        lv_obj_t *screen = lv_obj_create(nullptr);
        lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
        DisplayTheme::applyScreen(screen);
        applyInsets(screen);
        return screen;
    }
}
