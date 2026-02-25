#pragma once

#include <lvgl.h>

static void bg_img_left_align_update(lv_obj_t *bg_img)
{
   lv_obj_update_layout(bg_img);
   int32_t w = lv_obj_get_width(bg_img);
   int32_t scaled_w = lv_image_get_transformed_width(bg_img);
   if (w > 0 && scaled_w > 0)
      lv_image_set_offset_x(bg_img, -(w - scaled_w) / 2);
}

static void bg_img_parent_size_cb(lv_event_t *e)
{
   bg_img_left_align_update(static_cast<lv_obj_t *>(lv_event_get_user_data(e)));
}

/** Call after creating a COVER bg image to keep its left border in view.
 *  Note: Do NOT use LV_EVENT_DRAW_MAIN_BEGIN - invalidation during rendering
 *  triggers lv_inv_area assertion. SIZE_CHANGED + initial update suffice. */
static void lv_image_cover_left_align(lv_obj_t *bg_img)
{
   lv_obj_add_event_cb(lv_obj_get_parent(bg_img), bg_img_parent_size_cb, LV_EVENT_SIZE_CHANGED, bg_img);
   bg_img_left_align_update(bg_img);
}
