#include "resourceDetailsScreen.hpp"
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

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
void ResourceDetailsScreen::showActionProgress(const char *title)
{
   this->actionInProgress = true;
   this->actionTitle = title ? title : "Bitte warten";
   actionOverlay.show(this->screen, this->actionTitle.c_str(), this->resourceCacheValid ? this->resourceCache.name : "");
}
void ResourceDetailsScreen::hideActionProgress()
{
   actionOverlay.hide();
   this->activeActionButton = nullptr;
   this->activeActionLabel = nullptr;
   this->activeActionSpinner = nullptr;
   this->actionInProgress = false;
}
void ResourceDetailsScreen::hideActionProgressVisual() { actionOverlay.hide(); }
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
      DisplayTheme::applySurface(this->successToast);
      lv_obj_set_style_bg_color(this->successToast, DisplayTheme::success(), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_border_color(this->successToast, DisplayTheme::success(), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_left(this->successToast, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_right(this->successToast, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_top(this->successToast, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_bottom(this->successToast, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   }

   // Replace content
   lv_obj_clean(this->successToast);
   lv_obj_t *lbl = lv_label_create(this->successToast);
   lv_label_set_text(lbl, text ? text : "Erfolgreich");
   lv_obj_set_style_text_color(lbl, DisplayTheme::onPrimary(), LV_PART_MAIN | LV_STATE_DEFAULT);

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
