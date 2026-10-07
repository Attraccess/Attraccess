#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

void ResourceDetailsScreen::onFieldPreviewClick(lv_event_t *e)
{
   if (lv_event_get_code(e) != LV_EVENT_CLICKED)
   {
      return;
   }
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   if (self->formsBusy)
   {
      return;
   }
   lv_obj_t *target = static_cast<lv_obj_t *>(lv_event_get_current_target(e));
   FormFieldWidget *widget = self->findFieldWidgetByObject(target);
   if (!widget)
   {
      return;
   }
   if (widget->type == API::ResourceUsageFormFieldType::BOOLEAN || widget->type == API::ResourceUsageFormFieldType::SELECT)
   {
      return;
   }
   self->openFormsEditor(widget->widgetIndex);
}
void ResourceDetailsScreen::onFormsEditorKeyboardEvent(lv_event_t *e)
{
   auto code = lv_event_get_code(e);
   if (code != LV_EVENT_READY && code != LV_EVENT_CANCEL)
   {
      return;
   }
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   // Checkmark commits the text, keyboard-hide discards it.
   self->closeFormsEditor(code == LV_EVENT_READY);
}
void ResourceDetailsScreen::onFormsEditorCancel(lv_event_t *e)
{
   if (lv_event_get_code(e) != LV_EVENT_CLICKED)
   {
      return;
   }
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   self->closeFormsEditor(false);
}
