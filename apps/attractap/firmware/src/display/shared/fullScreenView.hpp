#pragma once

#include <lvgl.h>

#include "../theme.hpp"

// Room a page that fills the display leaves for the chrome on the top layer:
// the drawer grabber and network badge (top right, y 12-42) above, and the
// device footer (y 458-470) below.
namespace FullScreenInsets
{
    constexpr int32_t Top = 48;
    constexpr int32_t Side = 16;
    constexpr int32_t Bottom = 28;

    inline void apply(lv_obj_t *obj)
    {
        lv_obj_set_style_pad_top(obj, Top, LV_PART_MAIN);
        lv_obj_set_style_pad_left(obj, Side, LV_PART_MAIN);
        lv_obj_set_style_pad_right(obj, Side, LV_PART_MAIN);
        lv_obj_set_style_pad_bottom(obj, Bottom, LV_PART_MAIN);
    }
}

// A page that fills the whole display as a child of a screen root, for flows
// that live inside one screen (usage forms, project picker). Unlike a layer-top
// dialog it is part of the screen: it leaves the display when the screen does.
// Floating, so it ignores the screen's padding, layout and scroll position; its
// content sits inside FullScreenInsets like the top-up screen's.
// Created hidden; the caller fills it and removes LV_OBJ_FLAG_HIDDEN.
inline lv_obj_t *createFullScreenView(lv_obj_t *screenRoot)
{
    lv_display_t *display = lv_obj_get_display(screenRoot);
    lv_obj_t *view = lv_obj_create(screenRoot);
    lv_obj_remove_style_all(view);
    DisplayTheme::applyScreen(view);
    FullScreenInsets::apply(view);
    lv_obj_add_flag(view, LV_OBJ_FLAG_IGNORE_LAYOUT);
    lv_obj_add_flag(view, LV_OBJ_FLAG_FLOATING);
    lv_obj_add_flag(view, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(view, LV_OBJ_FLAG_HIDDEN);
    lv_obj_remove_flag(view, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(view, lv_display_get_horizontal_resolution(display), lv_display_get_vertical_resolution(display));
    lv_obj_set_pos(view,
                   -lv_obj_get_style_pad_left(screenRoot, LV_PART_MAIN),
                   -lv_obj_get_style_pad_top(screenRoot, LV_PART_MAIN));
    return view;
}
