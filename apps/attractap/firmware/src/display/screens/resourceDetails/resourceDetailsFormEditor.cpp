#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

void ResourceDetailsScreen::updateFieldPreview(FormFieldWidget &widget)
{
   if (!widget.previewLabel)
   {
      return;
   }
   std::string trimmed = widget.textValue;
   trimString(trimmed);
   if (trimmed.length() == 0)
   {
      // Empty: show the field placeholder (or a generic hint) in muted gray.
      const char *hint = "Antippen zum Eingeben";
      if (widget.definition && widget.type == API::ResourceUsageFormFieldType::TEXT &&
          widget.definition->options.text.hasPlaceholder && widget.definition->options.text.placeholder.length() > 0)
      {
         hint = widget.definition->options.text.placeholder.c_str();
      }
      lv_label_set_text(widget.previewLabel, hint);
      lv_obj_set_style_text_color(widget.previewLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   else
   {
      const std::string displayValue = makeLVGLDisplayText(widget.textValue);
      lv_label_set_text(widget.previewLabel, displayValue.c_str());
      lv_obj_set_style_text_color(widget.previewLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   }
}
void ResourceDetailsScreen::openFormsEditor(uint16_t widgetIndex)
{
   if (!this->formsEditorOverlay || !this->formsEditorTextarea || !this->formsEditorKeyboard)
   {
      return;
   }
   if (widgetIndex >= this->formFieldWidgetCount)
   {
      return;
   }
   FormFieldWidget &widget = this->formFieldWidgets[widgetIndex];
   this->formsEditorWidgetIndex = widgetIndex;

   if (this->formsEditorTitleLabel)
   {
      std::string title = widget.definition ? widget.definition->name : std::string("");
      if (widget.isRequired)
      {
         title += " *";
      }
      lv_label_set_text(this->formsEditorTitleLabel, title.c_str());
   }

   bool multiline = widget.definition && widget.type == API::ResourceUsageFormFieldType::TEXT &&
                    widget.definition->options.text.multiline;
   lv_textarea_set_one_line(this->formsEditorTextarea, !multiline);
   // Multiline: textarea fills the space above the keyboard. One-line: textarea
   // stays compact under the header, spacer pushes the keyboard to the bottom.
   lv_obj_set_flex_grow(this->formsEditorTextarea, multiline ? 1 : 0);
   if (this->formsEditorSpacer)
   {
      lv_obj_set_flex_grow(this->formsEditorSpacer, multiline ? 0 : 1);
      lv_obj_set_height(this->formsEditorSpacer, multiline ? 0 : LV_SIZE_CONTENT);
   }
   lv_textarea_set_accepted_chars(this->formsEditorTextarea,
                                  widget.type == API::ResourceUsageFormFieldType::NUMBER ? "0123456789-." : nullptr);
   const char *placeholder = "";
   if (widget.definition && widget.type == API::ResourceUsageFormFieldType::TEXT &&
       widget.definition->options.text.hasPlaceholder)
   {
      placeholder = widget.definition->options.text.placeholder.c_str();
   }
   lv_textarea_set_placeholder_text(this->formsEditorTextarea, placeholder);
   this->formsEditorInitialText = makeLVGLDisplayText(widget.textValue);
   lv_textarea_set_text(this->formsEditorTextarea, this->formsEditorInitialText.c_str());
   lv_textarea_set_cursor_pos(this->formsEditorTextarea, LV_TEXTAREA_CURSOR_LAST);

   lv_keyboard_set_mode(this->formsEditorKeyboard,
                        widget.type == API::ResourceUsageFormFieldType::NUMBER ? LV_KEYBOARD_MODE_NUMBER
                                                                               : LV_KEYBOARD_MODE_TEXT_LOWER);
   lv_keyboard_set_textarea(this->formsEditorKeyboard, this->formsEditorTextarea);

   lv_obj_clear_flag(this->formsEditorOverlay, LV_OBJ_FLAG_HIDDEN);
   lv_obj_move_foreground(this->formsEditorOverlay);
}
void ResourceDetailsScreen::closeFormsEditor(bool commit)
{
   if (!this->formsEditorOverlay)
   {
      return;
   }
   if (commit && this->formsEditorTextarea && this->formsEditorWidgetIndex < this->formFieldWidgetCount)
   {
      FormFieldWidget &widget = this->formFieldWidgets[this->formsEditorWidgetIndex];
      if (widget.type != API::ResourceUsageFormFieldType::BOOLEAN &&
          widget.type != API::ResourceUsageFormFieldType::SELECT)
      {
         const char *text = lv_textarea_get_text(this->formsEditorTextarea);
         const std::string editedText = text ? std::string(text) : std::string("");
         // Opening/confirming a fallback-rendered draft must not rewrite its
         // original protocol value. Only an actual edit replaces the draft.
         if (editedText != this->formsEditorInitialText)
         {
            widget.textValue = editedText;
         }
         this->updateFieldPreview(widget);
      }
   }
   if (this->formsEditorKeyboard)
   {
      lv_keyboard_set_textarea(this->formsEditorKeyboard, nullptr);
   }
   lv_obj_add_flag(this->formsEditorOverlay, LV_OBJ_FLAG_HIDDEN);
}
