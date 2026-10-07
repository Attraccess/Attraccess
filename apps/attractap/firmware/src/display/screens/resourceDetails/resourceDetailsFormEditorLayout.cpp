#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

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
   lv_label_set_text(this->formsEditorTitleLabel, "");
   lv_obj_set_flex_grow(this->formsEditorTitleLabel, 1);
   lv_label_set_long_mode(this->formsEditorTitleLabel, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_color(this->formsEditorTitleLabel, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->formsEditorTitleLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *editorCancelBtn = lv_button_create(editorHeader);
   lv_obj_remove_style_all(editorCancelBtn);
   lv_obj_set_size(editorCancelBtn, 34, 34);
   DisplayTheme::secondaryButton(editorCancelBtn);
   lv_obj_t *editorCancelLabel = lv_label_create(editorCancelBtn);
   lv_label_set_text(editorCancelLabel, LV_SYMBOL_CLOSE);
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
