#include "resourceDetailsScreen.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>

static const char *SELECT_FIELD_PLACEHOLDER = "Bitte Option waehlen";
static const char *SELECT_FIELD_NO_OPTIONS = "Keine Optionen verfuegbar";
static const char *SELECT_FIELD_INVALID = "Ungueltige Auswahl";
static const lv_coord_t SELECT_FIELD_OPTION_GAP = 6;

void ResourceDetailsScreen::disposeFormsModal()
{
   if (this->formsModalOverlay)
   {
      lv_obj_del(this->formsModalOverlay);
   }
   this->resetFormsModalState();
}
void ResourceDetailsScreen::resetFormsModalState()
{
   this->formsModalOverlay = nullptr;
   this->formsModalPanel = nullptr;
   this->formsModalContent = nullptr;
   this->formsModalList = nullptr;
   this->formsModalErrorLabel = nullptr;
   this->formsModalProgressLabel = nullptr;
   this->formsProgressBar = nullptr;
   this->formsBreadcrumbLabel = nullptr;
   this->formsCancelButton = nullptr;
   this->formsBackButton = nullptr;
   this->formsNextButton = nullptr;
   this->formsNextLabel = nullptr;
   this->formsNextSpinner = nullptr;
   this->formsEditorOverlay = nullptr;
   this->formsEditorTitleLabel = nullptr;
   this->formsEditorTextarea = nullptr;
   this->formsEditorSpacer = nullptr;
   this->formsEditorKeyboard = nullptr;
   this->formsEditorWidgetIndex = 0;
   this->formsBusy = false;
   this->formsModalMeta = nullptr;
   this->formsModalPage = nullptr;
   this->formsCanGoBack = false;
   this->formsIsLastField = false;
   this->formFieldWidgetCount = 0;
}
void ResourceDetailsScreen::setFormPageNextCallback(std::function<void(const API::FormPageSubmission &)> callback)
{
   this->formPageNextCallback = callback;
}
void ResourceDetailsScreen::setFormPageBackCallback(std::function<void()> callback)
{
   this->formPageBackCallback = callback;
}
void ResourceDetailsScreen::setFormsCancelCallback(std::function<void()> callback)
{
   this->formsCancelCallback = callback;
}
void ResourceDetailsScreen::showFormsModal(const API::ResourceUsageFormRequest &meta)
{
   this->formsModalMeta = &meta;
   this->formsModalPage = nullptr;
   this->formFieldWidgetCount = 0;
   this->ensureFormsModal();

   if (this->formsModalList)
   {
      lv_obj_clean(this->formsModalList);
      lv_obj_t *loading = lv_label_create(this->formsModalList);
      lv_label_set_text(loading, "Laden...");
      lv_obj_set_style_text_color(loading, lv_color_hex(0xE5E7EB), LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   if (this->formsModalErrorLabel)
   {
      lv_label_set_text(this->formsModalErrorLabel, "");
   }
   if (this->formsModalProgressLabel)
   {
      lv_label_set_text(this->formsModalProgressLabel, "");
   }
   if (this->formsBackButton)
   {
      lv_obj_add_state(this->formsBackButton, LV_STATE_DISABLED);
   }

   this->closeFormsEditor(false);
   if (this->formsModalOverlay)
   {
      lv_obj_clear_flag(this->formsModalOverlay, LV_OBJ_FLAG_HIDDEN);
   }
   // Block input while the first field is being fetched from the server.
   this->setFormsBusy(true, "Laden...");
}
void ResourceDetailsScreen::renderFormField(const API::ResourceUsageFormFieldsPage &page, bool canGoBack, bool isLast, uint32_t fieldNumber, uint32_t totalFields)
{
   this->formsModalPage = &page;
   this->formsCanGoBack = canGoBack;
   this->formsIsLastField = isLast;
   this->ensureFormsModal();

   // Field arrived from the server: release the input block.
   this->setFormsBusy(false);

   if (this->formsModalProgressLabel)
   {
      std::string progress = std::to_string(fieldNumber) + " / " + std::to_string(totalFields);
      lv_label_set_text(this->formsModalProgressLabel, progress.c_str());
   }

   if (this->formsProgressBar && totalFields > 0)
   {
      int32_t pct = static_cast<int32_t>((static_cast<uint64_t>(fieldNumber) * 100) / totalFields);
      lv_bar_set_value(this->formsProgressBar, pct, LV_ANIM_ON);
   }

   this->buildCurrentFormField();

   if (this->formsBackButton)
   {
      if (canGoBack)
      {
         lv_obj_clear_state(this->formsBackButton, LV_STATE_DISABLED);
      }
      else
      {
         lv_obj_add_state(this->formsBackButton, LV_STATE_DISABLED);
      }
   }
   if (this->formsNextLabel)
   {
      lv_label_set_text(this->formsNextLabel, isLast ? "Absenden" : "Weiter");
   }

   this->closeFormsEditor(false);
}
void ResourceDetailsScreen::showFormPageErrors(const API::ResourceUsageFormPageResult &result)
{
   // Server rejected the page: release the block so the user can correct input.
   this->setFormsBusy(false);
   this->clearFormFieldErrors();
   bool shown = false;
   for (uint8_t i = 0; i < result.errorCount; ++i)
   {
      FormFieldWidget *widget = this->findFieldWidget(result.formId, result.errors[i].fieldId);
      if (widget && widget->errorLabel)
      {
         lv_label_set_text(widget->errorLabel, result.errors[i].message.c_str());
         shown = true;
      }
   }
   if (this->formsModalErrorLabel)
   {
      lv_label_set_text(this->formsModalErrorLabel, shown ? "Bitte Eingabe korrigieren." : "Eingabe ungueltig.");
   }
}
void ResourceDetailsScreen::hideFormsModal()
{
   if (this->formsModalOverlay)
   {
      lv_obj_add_flag(this->formsModalOverlay, LV_OBJ_FLAG_HIDDEN);
   }
   this->closeFormsEditor(false);
}
void ResourceDetailsScreen::ensureFormsModal()
{
   if (this->formsModalOverlay)
   {
      return;
   }

   lv_obj_t *overlay = lv_obj_create(lv_layer_top());
   this->formsModalOverlay = overlay;
   lv_obj_remove_style_all(overlay);
   lv_obj_remove_flag(overlay, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_add_flag(overlay, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_flag(overlay, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_set_size(overlay, lv_pct(100), lv_pct(100));
   lv_obj_set_style_bg_color(overlay, lv_color_black(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(overlay, 170, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_all(overlay, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(overlay, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(overlay, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   lv_obj_t *panel = lv_obj_create(overlay);
   this->formsModalPanel = panel;
   lv_obj_remove_style_all(panel);
   lv_obj_set_size(panel, lv_pct(100), lv_pct(100));
   lv_obj_set_style_max_width(panel, LV_COORD_MAX, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(panel, lv_color_hex(0x111827), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(panel, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(panel, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_all(panel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(panel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(panel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_grow(panel, 1);

   // Header: step counter (left) + dismiss button (right).
   lv_obj_t *header = lv_obj_create(panel);
   lv_obj_remove_style_all(header);
   lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(header, lv_pct(100));
   lv_obj_set_height(header, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

   this->formsModalProgressLabel = lv_label_create(header);
   lv_label_set_text(this->formsModalProgressLabel, "");
   lv_obj_set_style_text_color(this->formsModalProgressLabel, lv_color_hex(0x9CA3AF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->formsModalProgressLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *cancelBtn = lv_button_create(header);
   this->formsCancelButton = cancelBtn;
   lv_obj_remove_style_all(cancelBtn);
   lv_obj_set_size(cancelBtn, 34, 34);
   lv_obj_set_style_radius(cancelBtn, LV_RADIUS_CIRCLE, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(cancelBtn, lv_color_hex(0x1F2937), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(cancelBtn, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_t *cancelLabel = lv_label_create(cancelBtn);
   lv_label_set_text(cancelLabel, LV_SYMBOL_CLOSE);
   lv_obj_set_style_text_color(cancelLabel, lv_color_hex(0x9CA3AF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_center(cancelLabel);
   lv_obj_add_event_cb(cancelBtn, &ResourceDetailsScreen::onFormsCancel, LV_EVENT_CLICKED, this);

   // Slim progress bar tracking field N of total.
   this->formsProgressBar = lv_bar_create(panel);
   lv_obj_set_width(this->formsProgressBar, lv_pct(100));
   lv_obj_set_height(this->formsProgressBar, 6);
   lv_obj_set_style_margin_top(this->formsProgressBar, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_margin_bottom(this->formsProgressBar, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->formsProgressBar, 3, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->formsProgressBar, lv_color_hex(0x374151), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->formsProgressBar, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->formsProgressBar, 3, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->formsProgressBar, lv_color_hex(0x10B981), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->formsProgressBar, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_bar_set_range(this->formsProgressBar, 0, 100);
   lv_bar_set_value(this->formsProgressBar, 0, LV_ANIM_OFF);

   // Body: breadcrumb + the single focused field, filling the panel. Never
   // scrolls — text fields are tap-to-edit previews, editing happens in the
   // fullscreen editor overlay, so everything always fits the screen.
   lv_obj_t *content = lv_obj_create(panel);
   this->formsModalContent = content;
   lv_obj_remove_style_all(content);
   lv_obj_set_width(content, lv_pct(100));
   lv_obj_set_flex_flow(content, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(content, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(content, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(content, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_remove_flag(content, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_grow(content, 1);

   this->formsBreadcrumbLabel = lv_label_create(content);
   lv_label_set_text(this->formsBreadcrumbLabel, "");
   lv_obj_set_style_text_color(this->formsBreadcrumbLabel, lv_color_hex(0x9CA3AF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->formsBreadcrumbLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_width(this->formsBreadcrumbLabel, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_label_set_long_mode(this->formsBreadcrumbLabel, LV_LABEL_LONG_WRAP);

   this->formsModalErrorLabel = lv_label_create(content);
   lv_label_set_text(this->formsModalErrorLabel, "");
   lv_obj_set_style_text_color(this->formsModalErrorLabel, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->formsModalErrorLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *list = lv_obj_create(content);
   this->formsModalList = list;
   lv_obj_remove_style_all(list);
   lv_obj_remove_flag(list, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(list, lv_pct(100));
   lv_obj_set_height(list, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(list, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(list, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(list, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_top(list, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Footer pinned below the body: secondary back + primary next/submit.
   lv_obj_t *footer = lv_obj_create(panel);
   lv_obj_remove_style_all(footer);
   lv_obj_remove_flag(footer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(footer, lv_pct(100));
   lv_obj_set_height(footer, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_top(footer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(footer, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *backBtn = lv_button_create(footer);
   this->formsBackButton = backBtn;
   lv_obj_set_flex_grow(backBtn, 1);
   lv_obj_set_height(backBtn, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_all(backBtn, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(backBtn, lv_color_hex(0x1F2937), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(backBtn, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_t *backLabel = lv_label_create(backBtn);
   lv_label_set_text(backLabel, "Zurueck");
   lv_obj_set_align(backLabel, LV_ALIGN_CENTER);
   lv_obj_add_event_cb(backBtn, &ResourceDetailsScreen::onFormsBack, LV_EVENT_CLICKED, this);

   lv_obj_t *nextBtn = lv_button_create(footer);
   this->formsNextButton = nextBtn;
   lv_obj_set_flex_grow(nextBtn, 2);
   lv_obj_set_height(nextBtn, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_all(nextBtn, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(nextBtn, lv_color_hex(0x10B981), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(nextBtn, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   this->formsNextLabel = lv_label_create(nextBtn);
   lv_label_set_text(this->formsNextLabel, "Weiter");
   lv_obj_set_align(this->formsNextLabel, LV_ALIGN_CENTER);
   this->formsNextSpinner = lv_spinner_create(nextBtn);
   lv_obj_update_layout(nextBtn);
   const lv_coord_t nextLabelHeight = lv_obj_get_height(this->formsNextLabel);
   lv_obj_set_size(this->formsNextSpinner, nextLabelHeight, nextLabelHeight);
   lv_obj_set_align(this->formsNextSpinner, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->formsNextSpinner, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(nextBtn, &ResourceDetailsScreen::onFormsNext, LV_EVENT_CLICKED, this);

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
   lv_obj_set_style_bg_color(editor, lv_color_hex(0x111827), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(editor, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
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
   lv_obj_set_style_text_color(this->formsEditorTitleLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->formsEditorTitleLabel, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *editorCancelBtn = lv_button_create(editorHeader);
   lv_obj_remove_style_all(editorCancelBtn);
   lv_obj_set_size(editorCancelBtn, 34, 34);
   lv_obj_set_style_radius(editorCancelBtn, LV_RADIUS_CIRCLE, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(editorCancelBtn, lv_color_hex(0x1F2937), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(editorCancelBtn, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_t *editorCancelLabel = lv_label_create(editorCancelBtn);
   lv_label_set_text(editorCancelLabel, LV_SYMBOL_CLOSE);
   lv_obj_set_style_text_color(editorCancelLabel, lv_color_hex(0x9CA3AF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_center(editorCancelLabel);
   lv_obj_add_event_cb(editorCancelBtn, &ResourceDetailsScreen::onFormsEditorCancel, LV_EVENT_CLICKED, this);

   // Textarea fills all space between header and keyboard.
   lv_obj_t *editorTa = lv_textarea_create(editor);
   this->formsEditorTextarea = editorTa;
   lv_obj_set_width(editorTa, lv_pct(100));
   lv_obj_set_flex_grow(editorTa, 1);
   lv_obj_set_style_bg_color(editorTa, lv_color_hex(0x374151), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_color(editorTa, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_obj_set_width(this->formsEditorKeyboard, lv_pct(100));
   lv_obj_set_height(this->formsEditorKeyboard, lv_pct(45));
   lv_obj_add_event_cb(this->formsEditorKeyboard, &ResourceDetailsScreen::onFormsEditorKeyboardEvent, LV_EVENT_ALL, this);

}
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

   std::string pageTitle = "Bitte Formular ausfuellen";
   std::string resourceName = "";

   if (this->formsModalMeta)
   {
      if (this->formsModalMeta->action == API::ResourceUsageFormActionType::START)
      {
         pageTitle = "Bitte vor dem Start ausfuellen";
      }
      else if (this->formsModalMeta->action == API::ResourceUsageFormActionType::END)
      {
         pageTitle = "Bitte vor dem Ende ausfuellen";
      }
      else if (this->formsModalMeta->action == API::ResourceUsageFormActionType::TAKEOVER)
      {
         pageTitle = "Bitte vor der Uebernahme ausfuellen";
      }

      if (this->formsModalMeta->resourceName.length() > 0)
      {
         resourceName = this->formsModalMeta->resourceName;
      }
   }

   std::string formName = "";
   if (this->formsModalMeta)
   {
      for (uint8_t i = 0; i < this->formsModalMeta->formCount && i < API::MAX_FORMS_PER_REQUEST; ++i)
      {
         if (this->formsModalMeta->forms[i].id == this->formsModalPage->formId)
         {
            formName = this->formsModalMeta->forms[i].name;
            break;
         }
      }
   }

   // Compact breadcrumb instead of three stacked headers: action context on the
   // first line, resource + form scope on the second.
   if (this->formsBreadcrumbLabel)
   {
      std::string breadcrumb = pageTitle;
      std::string scope = resourceName;
      if (formName.length() > 0)
      {
         if (scope.length() > 0)
         {
            scope += " - ";
         }
         scope += formName;
      }
      if (scope.length() > 0)
      {
         breadcrumb += "\n" + scope;
      }
      lv_label_set_text(this->formsBreadcrumbLabel, breadcrumb.c_str());
   }

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
         lv_obj_set_style_text_font(fieldLabel, &lv_font_montserrat_24, LV_PART_MAIN | LV_STATE_DEFAULT);
         lv_obj_set_style_text_color(fieldLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
         lv_obj_set_style_width(fieldLabel, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
         lv_label_set_long_mode(fieldLabel, LV_LABEL_LONG_WRAP);

         if (field.description.length() > 0)
         {
            lv_obj_t *desc = lv_label_create(fieldContainer);
            lv_label_set_text(desc, field.description.c_str());
            lv_obj_set_style_text_color(desc, lv_color_hex(0x9CA3AF), LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_text_font(desc, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
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
            lv_obj_set_style_bg_color(sw, lv_color_hex(0x10B981), LV_PART_INDICATOR | LV_STATE_CHECKED);
            if (field.hasValue && field.value == "true")
            {
               lv_obj_add_state(sw, LV_STATE_CHECKED);
            }
         }
         else if (field.type == API::ResourceUsageFormFieldType::SELECT)
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
               lv_obj_set_style_text_color(info, lv_color_hex(0xF5A524), LV_PART_MAIN | LV_STATE_DEFAULT);
               lv_obj_set_style_text_font(info, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
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
                  lv_obj_set_style_bg_color(optBtn, lv_color_hex(0x374151), LV_PART_MAIN | LV_STATE_DEFAULT);
                  lv_obj_set_style_bg_opa(optBtn, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
                  lv_obj_set_style_radius(optBtn, 6, LV_PART_MAIN | LV_STATE_DEFAULT);

                  lv_obj_t *optLabel = lv_label_create(optBtn);
                  lv_obj_set_width(optLabel, lv_pct(100));
                  lv_obj_set_align(optLabel, LV_ALIGN_CENTER);
                  lv_label_set_text(optLabel, field.options.select.values[optIndex].c_str());
                  lv_label_set_long_mode(optLabel, LV_LABEL_LONG_WRAP);
                  lv_obj_set_style_text_color(optLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);

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
            lv_obj_set_style_bg_color(preview, lv_color_hex(0x374151), LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_bg_opa(preview, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_radius(preview, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_pad_all(preview, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_pad_column(preview, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_flex_flow(preview, LV_FLEX_FLOW_ROW);
            lv_obj_set_flex_align(preview, LV_FLEX_ALIGN_SPACE_BETWEEN,
                                  multiline ? LV_FLEX_ALIGN_START : LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);

            lv_obj_t *valueLabel = lv_label_create(preview);
            widget.previewLabel = valueLabel;
            lv_obj_set_flex_grow(valueLabel, 1);
            // Multiline: wrap and clip at the fixed preview height. Single line: ellipsis.
            lv_label_set_long_mode(valueLabel, multiline ? LV_LABEL_LONG_WRAP : LV_LABEL_LONG_DOT);

            lv_obj_t *editIcon = lv_label_create(preview);
            lv_label_set_text(editIcon, LV_SYMBOL_EDIT);
            lv_obj_set_style_text_color(editIcon, lv_color_hex(0x9CA3AF), LV_PART_MAIN | LV_STATE_DEFAULT);

            lv_obj_add_event_cb(preview, &ResourceDetailsScreen::onFieldPreviewClick, LV_EVENT_CLICKED, this);
            this->updateFieldPreview(widget);
         }

         widget.errorLabel = lv_label_create(fieldContainer);
         lv_label_set_text(widget.errorLabel, "");
         lv_obj_set_style_text_color(widget.errorLabel, lv_color_hex(0xF31260), LV_PART_MAIN | LV_STATE_DEFAULT);
         lv_obj_set_style_text_font(widget.errorLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
      }
   }

   lv_obj_mark_layout_as_dirty(this->formsModalList);
   lv_obj_update_layout(this->formsModalList);
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
         lv_label_set_text(this->formsModalErrorLabel, "Bitte markierte Felder ausfuellen.");
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
      lv_obj_set_style_text_color(widget.previewLabel, lv_color_hex(0x9CA3AF), LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   else
   {
      lv_label_set_text(widget.previewLabel, widget.textValue.c_str());
      lv_obj_set_style_text_color(widget.previewLabel, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
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
   lv_textarea_set_text(this->formsEditorTextarea, widget.textValue.c_str());
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
         widget.textValue = text ? std::string(text) : std::string("");
         this->updateFieldPreview(widget);
      }
   }
   if (this->formsEditorKeyboard)
   {
      lv_keyboard_set_textarea(this->formsEditorKeyboard, nullptr);
   }
   lv_obj_add_flag(this->formsEditorOverlay, LV_OBJ_FLAG_HIDDEN);
}
void ResourceDetailsScreen::onFormsNext(lv_event_t *e)
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
   API::FormPageSubmission &page = self->formPageScratch;
   if (!self->collectCurrentField(page))
   {
      return;
   }
   // Block further input until the server confirms or rejects this page.
   self->setFormsBusy(true, "Bitte warten");
   if (self->formPageNextCallback)
   {
      self->formPageNextCallback(page);
   }
}
void ResourceDetailsScreen::onFormsBack(lv_event_t *e)
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
   if (!self->formsCanGoBack)
   {
      return;
   }
   // Block further input until the previous field arrives from the server.
   self->setFormsBusy(true, "Bitte warten");
   if (self->formPageBackCallback)
   {
      self->formPageBackCallback();
   }
}
void ResourceDetailsScreen::onFormsCancel(lv_event_t *e)
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
   self->hideFormsModal();
   if (self->formsCancelCallback)
   {
      self->formsCancelCallback();
   }
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
         lv_obj_set_style_bg_color(btn, lv_color_hex(0x10B981), LV_PART_MAIN | LV_STATE_DEFAULT);
      }
      else
      {
         lv_obj_set_style_bg_color(btn, lv_color_hex(0x374151), LV_PART_MAIN | LV_STATE_DEFAULT);
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
