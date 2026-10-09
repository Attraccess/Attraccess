#include "../resourceDetailsScreen.hpp"
#include "../../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "text.hpp"

void ResourceDetailsScreen::buildCurrentFormField()
{
   if (!this->formsModalList)
   {
      return;
   }

   lv_obj_clean(this->formsModalList);
   this->formFieldWidgetCount = 0;


   if (this->formsModalErrorLabel)
   {
      FirmwareI18n::setLabel(this->formsModalErrorLabel, FirmwareI18n::Text::literal(""));
   }

   if (!this->formsModalPage || this->formsModalPage->fieldCount == 0)
   {
      return;
   }

   updateFormBreadcrumb();

   {
      {
         const API::ResourceUsageFormField &field = this->formsModalPage->fields[0];
         lv_obj_t *fieldContainer = lv_obj_create(this->formsModalList);
         lv_obj_remove_style_all(fieldContainer);
         lv_obj_remove_flag(fieldContainer, LV_OBJ_FLAG_SCROLLABLE);
         lv_obj_set_width(fieldContainer, lv_pct(100));
         lv_obj_set_height(fieldContainer, LV_SIZE_CONTENT);
         lv_obj_set_flex_flow(fieldContainer, LV_FLEX_FLOW_COLUMN);
         lv_obj_set_flex_align(fieldContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
         lv_obj_set_style_pad_row(fieldContainer, 6, LV_PART_MAIN | LV_STATE_DEFAULT);

         std::string fieldTitle = field.name;
         if (field.isRequired)
         {
            fieldTitle += " *";
         }
         lv_obj_t *fieldLabel = lv_label_create(fieldContainer);
         FirmwareI18n::setDynamicLabel(fieldLabel, fieldTitle.c_str());
          lv_obj_set_style_text_font(fieldLabel, &attractap_font_montserrat_latin1_24, LV_PART_MAIN | LV_STATE_DEFAULT);
          lv_obj_set_style_text_color(fieldLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
         lv_obj_set_style_width(fieldLabel, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
         lv_label_set_long_mode(fieldLabel, LV_LABEL_LONG_WRAP);

         if (field.description.length() > 0)
         {
            lv_obj_t *desc = lv_label_create(fieldContainer);
            FirmwareI18n::setDynamicLabel(desc, field.description.c_str());
             lv_obj_set_style_text_color(desc, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
             lv_obj_set_style_text_font(desc, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_width(desc, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_label_set_long_mode(desc, LV_LABEL_LONG_WRAP);
         }

         FormFieldWidget &widget = this->formFieldWidgets[this->formFieldWidgetCount++];
         widget.widgetIndex = this->formFieldWidgetCount - 1;
         widget.formId = this->formsModalPage->formId;
         widget.fieldId = field.id;
         widget.type = field.type;
         widget.isRequired = field.isRequired;
         widget.input = nullptr;
         widget.previewLabel = nullptr;
         widget.textValue = "";
         widget.errorLabel = nullptr;
         widget.definition = &field;
         widget.owner = this;
         widget.selectOptionEventCount = 0;

         if (field.type == API::ResourceUsageFormFieldType::BOOLEAN)
         {
            lv_obj_t *sw = lv_switch_create(fieldContainer);
            widget.input = sw;
            lv_obj_set_size(sw, 64, 32);
            lv_obj_set_style_bg_color(sw, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_bg_color(sw, DisplayTheme::primary(), LV_PART_INDICATOR | LV_STATE_CHECKED);
            lv_obj_set_style_bg_color(sw, DisplayTheme::onPrimary(), LV_PART_KNOB | LV_STATE_DEFAULT);
            if (field.hasValue && field.value == "true")
            {
               lv_obj_add_state(sw, LV_STATE_CHECKED);
            }
         }
         else if (field.type == API::ResourceUsageFormFieldType::SELECT)
         {
            this->createSelectField(fieldContainer, widget, field);
         }
         else
         {
            // Text/number fields are not edited inline: a tap-to-edit preview
            // box opens the fullscreen editor overlay (textarea + keyboard),
            // so the form page itself never has to scroll.
            bool multiline = field.type == API::ResourceUsageFormFieldType::TEXT && field.options.text.multiline;

            lv_obj_t *preview = lv_obj_create(fieldContainer);
            widget.input = preview;
            widget.textValue = field.hasValue ? field.value : std::string("");
            lv_obj_remove_style_all(preview);
            lv_obj_add_flag(preview, LV_OBJ_FLAG_CLICKABLE);
            lv_obj_remove_flag(preview, LV_OBJ_FLAG_SCROLLABLE);
            lv_obj_set_width(preview, lv_pct(100));
            lv_obj_set_height(preview, multiline ? 96 : 52);
            DisplayTheme::field(preview);
            lv_obj_set_style_pad_all(preview, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_pad_column(preview, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_flex_flow(preview, LV_FLEX_FLOW_ROW);
            lv_obj_set_flex_align(preview, LV_FLEX_ALIGN_SPACE_BETWEEN,
                                  multiline ? LV_FLEX_ALIGN_START : LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);

            lv_obj_t *valueLabel = lv_label_create(preview);
            widget.previewLabel = valueLabel;
            lv_obj_set_flex_grow(valueLabel, 1);
            lv_obj_set_style_text_font(valueLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);
            // Multiline: wrap and clip at the fixed preview height. Single line: ellipsis.
            lv_label_set_long_mode(valueLabel, multiline ? LV_LABEL_LONG_WRAP : LV_LABEL_LONG_DOT);

            lv_obj_t *editIcon = lv_label_create(preview);
            FirmwareI18n::setLabel(editIcon, FirmwareI18n::Text::literal(LV_SYMBOL_EDIT));
            lv_obj_set_style_text_color(editIcon, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

            lv_obj_add_event_cb(preview, &ResourceDetailsScreen::onFieldPreviewClick, LV_EVENT_CLICKED, this);
            this->updateFieldPreview(widget);
         }

         widget.errorLabel = lv_label_create(fieldContainer);
         FirmwareI18n::setLabel(widget.errorLabel, FirmwareI18n::Text::literal(""));
          lv_obj_set_style_text_color(widget.errorLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
          lv_obj_set_style_text_font(widget.errorLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
      }
   }

   lv_obj_mark_layout_as_dirty(this->formsModalList);
   lv_obj_update_layout(this->formsModalList);
}

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
               FirmwareI18n::setLabel(info, SELECT_FIELD_NO_OPTIONS);
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
                  FirmwareI18n::setDynamicLabel(optLabel, displayValue.c_str());
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

// Form values must remain unchanged for submission, so prepare a separate
// display string for code points not covered by the reader's Latin-1 fonts.
std::string makeLVGLDisplayText(const std::string &input)
{
   std::string output;
   for (size_t index = 0; index < input.length();)
   {
      const unsigned char byte = static_cast<unsigned char>(input[index]);
      if (byte < 0x80)
      {
         output += input[index++];
         continue;
      }

      uint32_t codepoint = 0;
      size_t length = 0;
      if ((byte & 0xE0) == 0xC0 && index + 1 < input.length())
      {
         codepoint = ((byte & 0x1F) << 6) | (static_cast<unsigned char>(input[index + 1]) & 0x3F);
         length = 2;
      }
      else if ((byte & 0xF0) == 0xE0 && index + 2 < input.length())
      {
         codepoint = ((byte & 0x0F) << 12) | ((static_cast<unsigned char>(input[index + 1]) & 0x3F) << 6) |
                     (static_cast<unsigned char>(input[index + 2]) & 0x3F);
         length = 3;
      }
      else
      {
         output += '?';
         ++index;
         continue;
      }

      if (codepoint >= 0xA0 && codepoint <= 0xFF)
      {
         output.append(input, index, length);
      }
      else if (codepoint >= 0x300 && codepoint <= 0x36F)
      {
         // Keep the base character of decomposed accents.
      }
      else
      {
         switch (codepoint)
         {
         case 0x2018:
         case 0x2019:
         case 0x201A:
         case 0x2032:
            output += '\'';
            break;
         case 0x201C:
         case 0x201D:
         case 0x201E:
         case 0x2033:
            output += '"';
            break;
         case 0x2013:
         case 0x2014:
         case 0x2015:
         case 0x2022:
            output += '-';
            break;
         case 0x2026:
            output += "...";
            break;
         case 0x2122:
            output += "TM";
            break;
         default:
            output += '?';
            break;
         }
      }
      index += length;
   }
   return output;
}

bool ResourceDetailsScreen::collectCurrentField(API::FormPageSubmission &outPage)
{
   this->clearFormFieldErrors();

   if (!this->formsModalPage)
      return false;

   outPage.formId = this->formsModalPage->formId;
   outPage.offset = this->formsModalPage->offset;
   outPage.answerCount = 0;

   bool hasErrors = false;

   for (uint16_t i = 0; i < this->formFieldWidgetCount && i < API::MAX_FORM_PAGE_FIELDS; ++i)
   {
      FormFieldWidget &widget = this->formFieldWidgets[i];

      auto setError = [&](FirmwareI18n::Text msg)
      {
         if (widget.errorLabel)
         {
            FirmwareI18n::setLabel(widget.errorLabel, msg);
         }
         hasErrors = true;
      };

      if (widget.type == API::ResourceUsageFormFieldType::BOOLEAN)
      {
         bool isChecked = widget.input && lv_obj_has_state(widget.input, LV_STATE_CHECKED);
         // Required boolean fields must be checked (true)
         if (widget.isRequired && !isChecked)
         {
            setError(FirmwareI18n::Message::RequiredField);
            continue;
         }
         API::FormSubmissionAnswer &answer = outPage.answers[outPage.answerCount++];
         answer.fieldId = widget.fieldId;
         answer.type = API::FormSubmissionAnswer::ValueType::BOOLEAN;
         answer.boolValue = isChecked;
         continue;
      }
      if (widget.type == API::ResourceUsageFormFieldType::SELECT)
      {
         // selectedOptionIndex is 1-based (0 = no selection)
         if (widget.selectedOptionIndex == 0)
         {
            if (widget.isRequired)
            {
               setError(FirmwareI18n::Message::RequiredField);
            }
            continue;
         }
         // Convert to 0-based index for accessing the values array
         uint8_t valueIndex = widget.selectedOptionIndex - 1;
         if (!widget.definition || valueIndex >= widget.definition->options.select.count)
         {
            setError(SELECT_FIELD_INVALID);
            continue;
         }
         API::FormSubmissionAnswer &answer = outPage.answers[outPage.answerCount++];
         answer.fieldId = widget.fieldId;
         answer.type = API::FormSubmissionAnswer::ValueType::STRING;
         answer.stringValue = widget.definition->options.select.values[valueIndex];
         continue;
      }

      // Text/number values live in widget.textValue (committed by the fullscreen editor).
      std::string value = widget.textValue;
      trimString(value);

      if (value.length() == 0)
      {
         if (widget.isRequired)
         {
            setError(FirmwareI18n::Message::RequiredField);
         }
         continue;
      }

      API::FormSubmissionAnswer &answer = outPage.answers[outPage.answerCount++];
      answer.fieldId = widget.fieldId;

      if (widget.type == API::ResourceUsageFormFieldType::NUMBER)
      {
         answer.type = API::FormSubmissionAnswer::ValueType::NUMBER;
         answer.numberValue = strtod(value.c_str(), nullptr);
      }
      else
      {
         answer.type = API::FormSubmissionAnswer::ValueType::STRING;
         answer.stringValue = value;
      }
   }

   if (hasErrors)
   {
      if (this->formsModalErrorLabel)
      {
         FirmwareI18n::setLabel(this->formsModalErrorLabel, FirmwareI18n::Message::PleaseCompleteTheHighlightedFields);
      }
      return false;
   }

   return true;
}
ResourceDetailsScreen::FormFieldWidget *ResourceDetailsScreen::findFieldWidget(uint32_t formId, uint32_t fieldId)
{
   for (uint16_t i = 0; i < this->formFieldWidgetCount; ++i)
   {
      if (this->formFieldWidgets[i].formId == formId && this->formFieldWidgets[i].fieldId == fieldId)
      {
         return &this->formFieldWidgets[i];
      }
   }
   return nullptr;
}
ResourceDetailsScreen::FormFieldWidget *ResourceDetailsScreen::findFieldWidgetByObject(lv_obj_t *object)
{
   if (!object)
   {
      return nullptr;
   }
   for (uint16_t i = 0; i < this->formFieldWidgetCount; ++i)
   {
      FormFieldWidget &widget = this->formFieldWidgets[i];
      if (widget.input == object)
      {
         return &widget;
      }
   }
   return nullptr;
}
void ResourceDetailsScreen::clearFormFieldErrors()
{
   for (uint16_t i = 0; i < this->formFieldWidgetCount; ++i)
   {
      if (this->formFieldWidgets[i].errorLabel)
      {
         FirmwareI18n::setLabel(this->formFieldWidgets[i].errorLabel, FirmwareI18n::Text::literal(""));
      }
   }
   if (this->formsModalErrorLabel)
   {
      FirmwareI18n::setLabel(this->formsModalErrorLabel, FirmwareI18n::Text::literal(""));
   }
}
