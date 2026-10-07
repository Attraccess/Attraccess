#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

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
      lv_label_set_text(this->formsModalErrorLabel, "");
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
         lv_label_set_text(fieldLabel, fieldTitle.c_str());
          lv_obj_set_style_text_font(fieldLabel, &attractap_font_montserrat_latin1_24, LV_PART_MAIN | LV_STATE_DEFAULT);
          lv_obj_set_style_text_color(fieldLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
         lv_obj_set_style_width(fieldLabel, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
         lv_label_set_long_mode(fieldLabel, LV_LABEL_LONG_WRAP);

         if (field.description.length() > 0)
         {
            lv_obj_t *desc = lv_label_create(fieldContainer);
            lv_label_set_text(desc, field.description.c_str());
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
            lv_label_set_text(editIcon, LV_SYMBOL_EDIT);
            lv_obj_set_style_text_color(editIcon, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);

            lv_obj_add_event_cb(preview, &ResourceDetailsScreen::onFieldPreviewClick, LV_EVENT_CLICKED, this);
            this->updateFieldPreview(widget);
         }

         widget.errorLabel = lv_label_create(fieldContainer);
         lv_label_set_text(widget.errorLabel, "");
          lv_obj_set_style_text_color(widget.errorLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
          lv_obj_set_style_text_font(widget.errorLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
      }
   }

   lv_obj_mark_layout_as_dirty(this->formsModalList);
   lv_obj_update_layout(this->formsModalList);
}
