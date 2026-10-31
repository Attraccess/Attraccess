#include "../i18n.hpp"
#pragma once

#include <lvgl.h>

// A page that fills the whole display as a child of a screen root, for flows
// that live inside one screen (usage forms, project picker). Unlike a layer-top
// dialog it is part of the screen: it leaves the display when the screen does.
// Floating, so it ignores the screen's padding, layout and scroll position.
// Created hidden; the caller fills it and removes LV_OBJ_FLAG_HIDDEN.
inline lv_obj_t *createFullScreenView(lv_obj_t *screenRoot)
{
    lv_display_t *display = lv_obj_get_display(screenRoot);
    lv_obj_t *view = lv_obj_create(screenRoot);
    lv_obj_remove_style_all(view);
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
