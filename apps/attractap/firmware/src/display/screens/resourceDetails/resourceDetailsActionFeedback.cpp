#include "resourceDetailsScreen.hpp"
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

void ResourceDetailsScreen::disposeActionOverlay()
{
   if (this->actionOverlay)
   {
      lv_obj_del(this->actionOverlay);
   }
   this->actionOverlay = nullptr;
   this->actionOverlayLabel = nullptr;
}
void ResourceDetailsScreen::disposeSuccessToast()
{
   if (this->successToastTimer)
   {
      lv_timer_del(this->successToastTimer);
      this->successToastTimer = nullptr;
   }
   if (this->successToast)
   {
      lv_obj_del(this->successToast);
      this->successToast = nullptr;
   }
}
void ResourceDetailsScreen::onToastDelete(lv_event_t *e)
{
   (void)e;
}
void ResourceDetailsScreen::showActionProgress(const char *text)
{
   if (!this->actionOverlay)
   {
      lv_obj_t *top = lv_layer_top();
      this->actionOverlay = lv_obj_create(top);
      lv_obj_remove_style_all(this->actionOverlay);
      lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_IGNORE_LAYOUT);
      lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_CLICKABLE); // block input behind
      lv_obj_remove_flag(this->actionOverlay, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_set_size(this->actionOverlay, lv_pct(100), lv_pct(100));
      lv_obj_set_align(this->actionOverlay, LV_ALIGN_CENTER);
      lv_obj_set_style_bg_color(this->actionOverlay, lv_color_black(), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_bg_opa(this->actionOverlay, 128, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_flex_flow(this->actionOverlay, LV_FLEX_FLOW_COLUMN);
      lv_obj_set_flex_align(this->actionOverlay, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

      lv_obj_t *spinner = lv_spinner_create(this->actionOverlay);
      lv_obj_set_size(spinner, 48, 48);

      this->actionOverlayLabel = lv_label_create(this->actionOverlay);
      lv_label_set_text(this->actionOverlayLabel, "Bitte warten");
      lv_obj_set_style_text_color(this->actionOverlayLabel, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   if (text && this->actionOverlayLabel)
   {
      lv_label_set_text(this->actionOverlayLabel, text);
   }
   lv_obj_clear_flag(this->actionOverlay, LV_OBJ_FLAG_HIDDEN);
}
void ResourceDetailsScreen::hideActionProgress()
{
   if (!this->actionOverlay)
      return;
   lv_obj_add_flag(this->actionOverlay, LV_OBJ_FLAG_HIDDEN);
}
void ResourceDetailsScreen::showSuccessToast(const char *text, uint16_t ms)
{
   if (!this->screen)
   {
      return;
   }
   // Create toast once and reuse to avoid LVGL invalidation/delete during draw
   if (!this->successToast)
   {
      this->successToast = lv_obj_create(this->screen);
      lv_obj_remove_style_all(this->successToast);
      lv_obj_set_size(this->successToast, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
      lv_obj_set_align(this->successToast, LV_ALIGN_BOTTOM_MID);
      lv_obj_set_style_bg_color(this->successToast, lv_color_hex(0x10B981), LV_PART_MAIN | LV_STATE_DEFAULT); // green
      lv_obj_set_style_bg_opa(this->successToast, 230, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_left(this->successToast, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_right(this->successToast, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_top(this->successToast, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_bottom(this->successToast, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_radius(this->successToast, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   // Replace content
   lv_obj_clean(this->successToast);
   lv_obj_t *lbl = lv_label_create(this->successToast);
   lv_label_set_text(lbl, text ? text : "Erfolgreich");
   lv_obj_set_style_text_color(lbl, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);

   // Show now
   lv_obj_clear_flag(this->successToast, LV_OBJ_FLAG_HIDDEN);

   // Cancel any existing hide timer
   if (this->successToastTimer)
   {
      lv_timer_del(this->successToastTimer);
      this->successToastTimer = nullptr;
   }

   // Schedule hide (no deletion) to avoid cross-event deletes
   this->successToastTimer = lv_timer_create(
       [](lv_timer_t *timer)
       {
          auto *self = static_cast<ResourceDetailsScreen *>(lv_timer_get_user_data(timer));
          if (self && self->successToast)
          {
             lv_obj_add_flag(self->successToast, LV_OBJ_FLAG_HIDDEN);
          }
          if (self)
          {
             self->successToastTimer = nullptr;
          }
          lv_timer_del(timer);
       },
       ms, this);
}
