#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

void ResourceDetailsScreen::setFormsBusy(bool busy, const char *)
{
   this->formsBusy = busy;
   if (busy)
   {
      this->closeFormsEditor(false);
   }
   // Disable controls while a request is in flight, without redrawing an overlay.
   lv_obj_t *const buttons[] = {this->formsNextButton, this->formsBackButton, this->formsCancelButton};
   for (lv_obj_t *button : buttons)
   {
      if (!button)
      {
         continue;
      }
      if (busy)
      {
         lv_obj_add_state(button, LV_STATE_DISABLED);
      }
      else
      {
         lv_obj_clear_state(button, LV_STATE_DISABLED);
      }
   }
   for (uint16_t i = 0; i < this->formFieldWidgetCount; ++i)
   {
      lv_obj_t *input = this->formFieldWidgets[i].input;
      if (!input)
      {
         continue;
      }
      if (busy)
      {
         lv_obj_add_state(input, LV_STATE_DISABLED);
      }
      else
      {
         lv_obj_clear_state(input, LV_STATE_DISABLED);
      }
   }
   // Back button stays disabled on the first field even when not busy.
   if (!busy && this->formsBackButton && !this->formsCanGoBack)
   {
      lv_obj_add_state(this->formsBackButton, LV_STATE_DISABLED);
   }
   if (this->formsNextLabel && this->formsNextSpinner)
   {
      if (busy)
      {
         lv_obj_add_flag(this->formsNextLabel, LV_OBJ_FLAG_HIDDEN);
         lv_obj_clear_flag(this->formsNextSpinner, LV_OBJ_FLAG_HIDDEN);
      }
      else
      {
         lv_obj_clear_flag(this->formsNextLabel, LV_OBJ_FLAG_HIDDEN);
         lv_obj_add_flag(this->formsNextSpinner, LV_OBJ_FLAG_HIDDEN);
         lv_label_set_text(this->formsNextLabel, this->formsIsLastField ? "Absenden" : "Weiter");
      }
   }
}
