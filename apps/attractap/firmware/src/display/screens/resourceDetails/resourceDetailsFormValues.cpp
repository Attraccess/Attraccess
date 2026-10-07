#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

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

      auto setError = [&](const char *msg)
      {
         if (widget.errorLabel)
         {
            lv_label_set_text(widget.errorLabel, msg);
         }
         hasErrors = true;
      };

      if (widget.type == API::ResourceUsageFormFieldType::BOOLEAN)
      {
         bool isChecked = widget.input && lv_obj_has_state(widget.input, LV_STATE_CHECKED);
         // Required boolean fields must be checked (true)
         if (widget.isRequired && !isChecked)
         {
            setError("Pflichtfeld");
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
               setError("Pflichtfeld");
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
            setError("Pflichtfeld");
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
         lv_label_set_text(this->formsModalErrorLabel, "Bitte markierte Felder ausfüllen.");
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
         lv_label_set_text(this->formFieldWidgets[i].errorLabel, "");
      }
   }
   if (this->formsModalErrorLabel)
   {
      lv_label_set_text(this->formsModalErrorLabel, "");
   }
}
