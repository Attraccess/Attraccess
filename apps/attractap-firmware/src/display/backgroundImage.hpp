#pragma once

#include <lvgl.h>

/** LVGL COVER centers the image; this callback left-aligns so the left edge stays in view. */
static void bg_img_left_align_cb(lv_event_t *e)
{
   lv_obj_t *bg_img = static_cast<lv_obj_t *>(lv_event_get_target(e));
   lv_obj_update_layout(bg_img);
   int32_t w = lv_obj_get_width(bg_img);
   int32_t scaled_w = lv_image_get_transformed_width(bg_img);
   lv_image_set_offset_x(bg_img, -(w - scaled_w) / 2);
}

/** Call after creating a COVER bg image to keep its left border in view. */
static void lv_image_cover_left_align(lv_obj_t *bg_img)
{
   lv_obj_add_event_cb(bg_img, bg_img_left_align_cb, LV_EVENT_SIZE_CHANGED, NULL);
}
