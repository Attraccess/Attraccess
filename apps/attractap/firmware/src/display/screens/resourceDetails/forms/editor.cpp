#include "../resourceDetailsScreen.hpp"
#include "../../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "text.hpp"

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
      const char *hint = "";
      bool useTranslatedHint = true;
      if (widget.definition && widget.type == API::ResourceUsageFormFieldType::TEXT &&
          widget.definition->options.text.hasPlaceholder && widget.definition->options.text.placeholder.length() > 0)
      {
         hint = widget.definition->options.text.placeholder.c_str();
         useTranslatedHint = false;
      }
      if (useTranslatedHint) FirmwareI18n::setLabel(widget.previewLabel, FirmwareI18n::Message::TapToEnter);
      else FirmwareI18n::setDynamicLabel(widget.previewLabel, hint);
      lv_obj_set_style_text_color(widget.previewLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   else
   {
      const std::string displayValue = makeLVGLDisplayText(widget.textValue);
      FirmwareI18n::setDynamicLabel(widget.previewLabel, displayValue.c_str());
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
      FirmwareI18n::setDynamicLabel(this->formsEditorTitleLabel, title.c_str());
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
   FirmwareI18n::setDynamicPlaceholder(this->formsEditorTextarea, placeholder);
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

void ResourceDetailsScreen::createFormsEditor(lv_obj_t *overlay)
{
   // Fullscreen text editor overlay: opened when a text/number preview box is
   // tapped. Solid background, textarea filling everything above the pinned
   // keyboard — the page itself never scrolls; only the text inside the
   // textarea scrolls when it grows beyond the visible area.
   lv_obj_t *editor = lv_obj_create(overlay);
   this->formsEditorOverlay = editor;
   lv_obj_remove_style_all(editor);
   lv_obj_add_flag(editor, LV_OBJ_FLAG_IGNORE_LAYOUT);
   lv_obj_add_flag(editor, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_add_flag(editor, LV_OBJ_FLAG_HIDDEN);
   lv_obj_remove_flag(editor, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_size(editor, lv_pct(100), lv_pct(100));
   lv_obj_set_align(editor, LV_ALIGN_CENTER);
   DisplayTheme::applyScreen(editor);
   lv_obj_set_style_pad_top(editor, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_left(editor, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_right(editor, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_bottom(editor, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_row(editor, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(editor, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(editor, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   // Editor header: field name (left) + cancel button (right).
   lv_obj_t *editorHeader = lv_obj_create(editor);
   lv_obj_remove_style_all(editorHeader);
   lv_obj_remove_flag(editorHeader, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(editorHeader, lv_pct(100));
   lv_obj_set_height(editorHeader, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(editorHeader, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(editorHeader, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_column(editorHeader, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

   this->formsEditorTitleLabel = lv_label_create(editorHeader);
   FirmwareI18n::setLabel(this->formsEditorTitleLabel, FirmwareI18n::Text::literal(""));
   lv_obj_set_flex_grow(this->formsEditorTitleLabel, 1);
   lv_label_set_long_mode(this->formsEditorTitleLabel, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_color(this->formsEditorTitleLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->formsEditorTitleLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *editorCancelBtn = lv_button_create(editorHeader);
   lv_obj_remove_style_all(editorCancelBtn);
   lv_obj_set_size(editorCancelBtn, 34, 34);
   DisplayTheme::secondaryButton(editorCancelBtn);
   lv_obj_t *editorCancelLabel = lv_label_create(editorCancelBtn);
   FirmwareI18n::setLabel(editorCancelLabel, FirmwareI18n::Text::literal(LV_SYMBOL_CLOSE));
   lv_obj_center(editorCancelLabel);
   lv_obj_add_event_cb(editorCancelBtn, &ResourceDetailsScreen::onFormsEditorCancel, LV_EVENT_CLICKED, this);


   // Textarea fills all space between header and keyboard.
   lv_obj_t *editorTa = lv_textarea_create(editor);
   this->formsEditorTextarea = editorTa;
   lv_obj_set_width(editorTa, lv_pct(100));
   lv_obj_set_flex_grow(editorTa, 1);
    DisplayTheme::field(editorTa);
    lv_obj_set_style_text_font(editorTa, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Spacer keeps the keyboard pinned to the bottom when the textarea is
   // one-line (multiline textareas grow instead, see openFormsEditor).
   lv_obj_t *editorSpacer = lv_obj_create(editor);
   this->formsEditorSpacer = editorSpacer;
   lv_obj_remove_style_all(editorSpacer);
   lv_obj_remove_flag(editorSpacer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_remove_flag(editorSpacer, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_set_width(editorSpacer, lv_pct(100));
   lv_obj_set_flex_grow(editorSpacer, 1);

   this->formsEditorKeyboard = lv_keyboard_create(editor);
   DisplayTheme::keyboard(this->formsEditorKeyboard);
   lv_obj_set_width(this->formsEditorKeyboard, lv_pct(100));
   lv_obj_set_height(this->formsEditorKeyboard, lv_pct(45));
   lv_obj_add_event_cb(this->formsEditorKeyboard, &ResourceDetailsScreen::onFormsEditorKeyboardEvent, LV_EVENT_ALL, this);

}

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
