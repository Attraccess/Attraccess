#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

void ResourceDetailsScreen::onSelectOptionClick(lv_event_t *e)
{
   auto *evtData = static_cast<SelectOptionEventData *>(lv_event_get_user_data(e));
   if (!evtData || !evtData->self)
   {
      return;
   }

   auto *self = evtData->self;
   if (self->formsBusy)
   {
      return;
   }
   if (evtData->widgetIndex >= self->formFieldWidgetCount)
   {
      return;
   }

   FormFieldWidget &widget = self->formFieldWidgets[evtData->widgetIndex];

   // Toggle: if same option clicked again, deselect it
   if (widget.selectedOptionIndex == evtData->optionIndex)
   {
      widget.selectedOptionIndex = 0;
   }
   else
   {
      widget.selectedOptionIndex = evtData->optionIndex;
   }

   self->updateSelectButtonStyles(widget);
}
void ResourceDetailsScreen::onSelectContainerSizeChanged(lv_event_t *e)
{
   auto *widget = static_cast<FormFieldWidget *>(lv_event_get_user_data(e));
   if (!widget || !widget->owner)
   {
      return;
   }
   widget->owner->updateSelectOptionLayout(*widget);
}
void ResourceDetailsScreen::updateSelectButtonStyles(FormFieldWidget &widget)
{
   if (!widget.input)
   {
      return;
   }

   uint32_t childCount = lv_obj_get_child_count(widget.input);
   for (uint32_t i = 0; i < childCount; ++i)
   {
      lv_obj_t *btn = lv_obj_get_child(widget.input, i);
      if (!btn)
      {
         continue;
      }

      // optionIndex is 1-based, child index is 0-based
      bool isSelected = (widget.selectedOptionIndex == (i + 1));
      if (isSelected)
      {
         DisplayTheme::button(btn);
      }
      else
      {
         DisplayTheme::secondaryButton(btn);
      }
   }
}
void ResourceDetailsScreen::updateSelectOptionLayout(FormFieldWidget &widget)
{
   if (widget.type != API::ResourceUsageFormFieldType::SELECT)
   {
      return;
   }
   if (!widget.input)
   {
      return;
   }
   if (!widget.definition || widget.definition->options.select.count == 0)
   {
      return;
   }

   lv_coord_t containerWidth = lv_obj_get_width(widget.input);
   lv_coord_t padLeft = lv_obj_get_style_pad_left(widget.input, LV_PART_MAIN);
   lv_coord_t padRight = lv_obj_get_style_pad_right(widget.input, LV_PART_MAIN);
   lv_coord_t innerWidth = containerWidth - padLeft - padRight;
   if (innerWidth <= 0)
   {
      return;
   }

   lv_coord_t gap = SELECT_FIELD_OPTION_GAP;
   lv_coord_t widthPerButton = (innerWidth - (gap * 2)) / 3;
   if (widthPerButton < 0)
   {
      widthPerButton = innerWidth / 3;
   }

   uint32_t childCount = lv_obj_get_child_count(widget.input);
   for (uint32_t i = 0; i < childCount; ++i)
   {
      lv_obj_t *btn = lv_obj_get_child(widget.input, i);
      if (!btn)
      {
         continue;
      }
      if (lv_obj_get_width(btn) != widthPerButton)
      {
         lv_obj_set_width(btn, widthPerButton);
      }
   }

   lv_obj_invalidate(widget.input);
}
