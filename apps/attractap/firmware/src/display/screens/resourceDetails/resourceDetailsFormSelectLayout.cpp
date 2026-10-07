#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

void ResourceDetailsScreen::createSelectField(lv_obj_t *fieldContainer, FormFieldWidget &widget, const API::ResourceUsageFormField &field)
{
            // Use a button grid for select options instead of lv_dropdown
            // lv_dropdown creates a popup list that causes memory issues on ESP32
            lv_obj_t *selectContainer = lv_obj_create(fieldContainer);
            lv_obj_remove_style_all(selectContainer);
            lv_obj_remove_flag(selectContainer, LV_OBJ_FLAG_SCROLLABLE);
            lv_obj_set_width(selectContainer, lv_pct(100));
            lv_obj_set_height(selectContainer, LV_SIZE_CONTENT);
            lv_obj_set_flex_flow(selectContainer, LV_FLEX_FLOW_ROW_WRAP);
            lv_obj_set_flex_align(selectContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
            lv_obj_set_style_pad_gap(selectContainer, SELECT_FIELD_OPTION_GAP, LV_PART_MAIN | LV_STATE_DEFAULT);

            widget.input = selectContainer;
            widget.selectedOptionIndex = 0; // 0 = no selection (placeholder)
            lv_obj_add_event_cb(selectContainer, &ResourceDetailsScreen::onSelectContainerSizeChanged, LV_EVENT_SIZE_CHANGED, &widget);

            if (field.options.select.count == 0)
            {
               lv_obj_t *info = lv_label_create(selectContainer);
               lv_label_set_text(info, SELECT_FIELD_NO_OPTIONS);
                lv_obj_set_style_text_color(info, DisplayTheme::warning(), LV_PART_MAIN | LV_STATE_DEFAULT);
                lv_obj_set_style_text_font(info, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
               lv_obj_set_style_width(info, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
               lv_label_set_long_mode(info, LV_LABEL_LONG_WRAP);
            }
            else
            {
               // Create a button for each option
               for (uint8_t optIndex = 0; optIndex < field.options.select.count; ++optIndex)
               {
                  lv_obj_t *optBtn = lv_button_create(selectContainer);
                  lv_obj_set_height(optBtn, 48);
                  lv_obj_set_style_pad_all(optBtn, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
                  DisplayTheme::secondaryButton(optBtn);

                  lv_obj_t *optLabel = lv_label_create(optBtn);
                  lv_obj_set_width(optLabel, lv_pct(100));
                  lv_obj_set_align(optLabel, LV_ALIGN_CENTER);
                  const std::string displayValue = makeLVGLDisplayText(field.options.select.values[optIndex]);
                  lv_label_set_text(optLabel, displayValue.c_str());
                  lv_label_set_long_mode(optLabel, LV_LABEL_LONG_WRAP);
                  lv_obj_set_style_text_font(optLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

                  if (widget.selectOptionEventCount >= API::MAX_SELECT_OPTIONS)
                  {
                     this->logger.error("Select option event overflow");
                     continue;
                  }

                  SelectOptionEventData &evtData = widget.selectOptionEvents[widget.selectOptionEventCount++];
                  evtData.self = this;
                  evtData.widgetIndex = widget.widgetIndex;
                  evtData.optionIndex = static_cast<uint8_t>(optIndex + 1);

                  lv_obj_add_event_cb(optBtn, &ResourceDetailsScreen::onSelectOptionClick, LV_EVENT_CLICKED, &evtData);
               }
               if (field.hasValue && field.value.length() > 0)
               {
                  for (uint8_t optIndex = 0; optIndex < field.options.select.count; ++optIndex)
                  {
                     if (field.options.select.values[optIndex] == field.value)
                     {
                        widget.selectedOptionIndex = static_cast<uint8_t>(optIndex + 1);
                        break;
                     }
                  }
                  this->updateSelectButtonStyles(widget);
               }
               this->updateSelectOptionLayout(widget);
            }
}
