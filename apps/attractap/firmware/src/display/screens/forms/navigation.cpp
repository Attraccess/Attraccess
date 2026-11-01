#include "formsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "text.hpp"

void FormsScreen::resetFormsState()
{
   this->formsPanel = nullptr;
   this->formsContent = nullptr;
   this->formsList = nullptr;
   this->formsErrorLabel = nullptr;
   this->formsProgressLabel = nullptr;
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
   this->formsEditorInitialText.clear();
   this->formsBusy = false;
   this->formsMeta = nullptr;
   this->formsPage = nullptr;
   this->formsCanGoBack = false;
   this->formsIsLastField = false;
   this->formFieldWidgetCount = 0;
}
void FormsScreen::setFormPageNextCallback(std::function<void(const API::FormPageSubmission &)> callback)
{
   this->formPageNextCallback = callback;
}
void FormsScreen::setFormPageBackCallback(std::function<void()> callback)
{
   this->formPageBackCallback = callback;
}
void FormsScreen::setFormsCancelCallback(std::function<void()> callback)
{
   this->formsCancelCallback = callback;
}
void FormsScreen::showForm(const API::ResourceUsageFormRequest &meta)
{
   this->formsMeta = &meta;
   this->formsPage = nullptr;
   this->formFieldWidgetCount = 0;
   this->buildFormsView();

   if (this->formsList)
   {
      lv_obj_clean(this->formsList);
      lv_obj_t *loading = lv_label_create(this->formsList);
      FirmwareI18n::setLabel(loading, FirmwareI18n::Message::Loading);
      lv_obj_set_style_text_color(loading, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   if (this->formsErrorLabel)
   {
      FirmwareI18n::setLabel(this->formsErrorLabel, FirmwareI18n::Text::literal("") /* i18n-data: Empty control caption; no prose. */);
   }
   if (this->formsProgressLabel)
   {
      FirmwareI18n::setLabel(this->formsProgressLabel, FirmwareI18n::Text::literal("") /* i18n-data: Empty control caption; no prose. */);
   }
   if (this->formsBackButton)
   {
      lv_obj_add_state(this->formsBackButton, LV_STATE_DISABLED);
   }

   this->closeFormsEditor(false);
   // Block input while the first field is being fetched from the server.
   this->setFormsBusy(true, "Laden...");
}
void FormsScreen::renderFormField(const API::ResourceUsageFormFieldsPage &page, bool canGoBack, bool isLast, uint32_t fieldNumber, uint32_t totalFields)
{
   this->formsPage = &page;
   this->formsCanGoBack = canGoBack;
   this->formsIsLastField = isLast;
   this->buildFormsView();

   // Field arrived from the server: release the input block.
   this->setFormsBusy(false);

   if (this->formsProgressLabel)
   {
      FirmwareI18n::setLabel(this->formsProgressLabel, FirmwareI18n::Text::format(FirmwareI18n::Message::Pagination,
         {FirmwareI18n::Text::literal(std::to_string(fieldNumber)) /* i18n-data: Page number. */, FirmwareI18n::Text::literal(std::to_string(totalFields)) /* i18n-data: Page count. */}));
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
      FirmwareI18n::setLabel(this->formsNextLabel, isLast ? FirmwareI18n::Message::Submit : FirmwareI18n::Message::Next);
   }

   this->closeFormsEditor(false);
}
void FormsScreen::showFormPageErrors(const API::ResourceUsageFormPageResult &result)
{
   // Server rejected the page: release the block so the user can correct input.
   this->setFormsBusy(false);
   this->clearFormFieldErrors();
   bool shown = false;
   int unmatched = -1;
   for (uint8_t i = 0; i < result.errorCount; ++i)
   {
      FormFieldWidget *widget = this->findFieldWidget(result.formId, result.errors[i].fieldId);
      if (widget && widget->errorLabel)
      {
         FirmwareI18n::setLabel(widget->errorLabel, FirmwareI18n::formError(result.errors[i].code));
         shown = true;
      }
      else if (unmatched < 0)
      {
         unmatched = i;
      }
   }
   if (this->formsErrorLabel)
   {
      FirmwareI18n::setLabel(this->formsErrorLabel, unmatched >= 0 ? FirmwareI18n::formError(result.errors[unmatched].code)
         : shown ? FirmwareI18n::Text(FirmwareI18n::Message::PleaseCorrectYourInput) : FirmwareI18n::formError(""));
   }
}
void FormsScreen::resetForm()
{
   this->closeFormsEditor(false);
}

void FormsScreen::buildFormsView()
{
   if (this->screen)
   {
      return;
   }

   lv_obj_t *root = ScreenChrome::createScreen();
   this->screen = root;
   lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(root, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   lv_obj_t *panel = lv_obj_create(root);
   this->formsPanel = panel;
   lv_obj_remove_style_all(panel);
   lv_obj_set_size(panel, lv_pct(100), lv_pct(100));
   lv_obj_set_flex_flow(panel, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(panel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_remove_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_flex_grow(panel, 1);

   // Header: "‹ Cancel" left, page indicator right.
   lv_obj_t *header = lv_obj_create(panel);
   lv_obj_remove_style_all(header);
   lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(header, lv_pct(100));
   lv_obj_set_height(header, 36);
   lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

   lv_obj_t *cancelBtn = lv_button_create(header);
   this->formsCancelButton = cancelBtn;
   DisplayTheme::secondaryButton(cancelBtn);
   lv_obj_set_size(cancelBtn, 150, 36);
   lv_obj_set_flex_flow(cancelBtn, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(cancelBtn, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_column(cancelBtn, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_t *cancelIcon = lv_label_create(cancelBtn);
   FirmwareI18n::setDynamicLabel(cancelIcon, LV_SYMBOL_LEFT) /* i18n-data: Language-neutral LVGL icon glyph. */;
   lv_obj_t *cancelLabel = lv_label_create(cancelBtn);
   FirmwareI18n::setLabel(cancelLabel, FirmwareI18n::Message::Cancel);
   lv_obj_add_event_cb(cancelBtn, &FormsScreen::onFormsCancel, LV_EVENT_CLICKED, this);

   this->formsProgressLabel = lv_label_create(header);
   FirmwareI18n::setLabel(this->formsProgressLabel, FirmwareI18n::Text::literal("") /* i18n-data: Empty control caption; no prose. */);
   lv_obj_set_style_text_color(this->formsProgressLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->formsProgressLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);

   // Slim progress bar tracking field N of total.
   this->formsProgressBar = lv_bar_create(panel);
   lv_obj_set_width(this->formsProgressBar, lv_pct(100));
   lv_obj_set_height(this->formsProgressBar, 6);
   lv_obj_set_style_margin_top(this->formsProgressBar, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_margin_bottom(this->formsProgressBar, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->formsProgressBar, 3, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->formsProgressBar, DisplayTheme::primarySoft(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->formsProgressBar, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_radius(this->formsProgressBar, 3, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(this->formsProgressBar, DisplayTheme::primary(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(this->formsProgressBar, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_bar_set_range(this->formsProgressBar, 0, 100);
   lv_bar_set_value(this->formsProgressBar, 0, LV_ANIM_OFF);

   // Body: breadcrumb + the single focused field, filling the panel. Text
   // fields are tap-to-edit previews (editing happens in the fullscreen editor
   // overlay), so a field normally fits; only the largest selects overflow, and
   // then the body scrolls vertically.
   lv_obj_t *content = lv_obj_create(panel);
   this->formsContent = content;
   lv_obj_remove_style_all(content);
   lv_obj_set_width(content, lv_pct(100));
   lv_obj_set_flex_flow(content, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(content, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(content, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(content, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_scroll_dir(content, LV_DIR_VER);
   lv_obj_set_scrollbar_mode(content, LV_SCROLLBAR_MODE_AUTO);
   lv_obj_set_flex_grow(content, 1);

   this->formsBreadcrumbLabel = lv_label_create(content);
   FirmwareI18n::setLabel(this->formsBreadcrumbLabel, FirmwareI18n::Text::literal("") /* i18n-data: Empty control caption; no prose. */);
    lv_obj_set_style_text_color(this->formsBreadcrumbLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->formsBreadcrumbLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_width(this->formsBreadcrumbLabel, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_label_set_long_mode(this->formsBreadcrumbLabel, LV_LABEL_LONG_WRAP);

   this->formsErrorLabel = lv_label_create(content);
   FirmwareI18n::setLabel(this->formsErrorLabel, FirmwareI18n::Text::literal("") /* i18n-data: Empty control caption; no prose. */);
    lv_obj_set_style_text_color(this->formsErrorLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->formsErrorLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);


   lv_obj_t *list = lv_obj_create(content);
   this->formsList = list;
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
   DisplayTheme::secondaryButton(backBtn);
   lv_obj_t *backLabel = lv_label_create(backBtn);
   FirmwareI18n::setLabel(backLabel, FirmwareI18n::Message::Back);
   lv_obj_set_style_text_font(backLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_align(backLabel, LV_ALIGN_CENTER);
   lv_obj_add_event_cb(backBtn, &FormsScreen::onFormsBack, LV_EVENT_CLICKED, this);

   lv_obj_t *nextBtn = lv_button_create(footer);
   this->formsNextButton = nextBtn;
   lv_obj_set_flex_grow(nextBtn, 2);
   lv_obj_set_height(nextBtn, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_all(nextBtn, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   DisplayTheme::button(nextBtn);
   this->formsNextLabel = lv_label_create(nextBtn);
   FirmwareI18n::setLabel(this->formsNextLabel, FirmwareI18n::Message::Next);
   lv_obj_set_align(this->formsNextLabel, LV_ALIGN_CENTER);
   this->formsNextSpinner = lv_spinner_create(nextBtn);
   lv_obj_set_style_arc_color(this->formsNextSpinner, DisplayTheme::border(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_arc_color(this->formsNextSpinner, DisplayTheme::muted(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
   lv_obj_update_layout(nextBtn);
   const lv_coord_t nextLabelHeight = lv_obj_get_height(this->formsNextLabel);
   lv_obj_set_size(this->formsNextSpinner, nextLabelHeight, nextLabelHeight);
   lv_obj_set_align(this->formsNextSpinner, LV_ALIGN_CENTER);
   lv_obj_add_flag(this->formsNextSpinner, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(nextBtn, &FormsScreen::onFormsNext, LV_EVENT_CLICKED, this);

   this->createFormsEditor(root);

}

#include <string.h>

void FormsScreen::updateFormBreadcrumb()
{

   FirmwareI18n::Text pageTitle = FirmwareI18n::Message::PleaseCompleteTheForm;
   std::string resourceName = "";

   if (this->formsMeta)
   {
      if (this->formsMeta->action == API::ResourceUsageFormActionType::START)
      {
         pageTitle = FirmwareI18n::Message::PleaseCompleteBeforeStarting;
      }
      else if (this->formsMeta->action == API::ResourceUsageFormActionType::END)
      {
         pageTitle = FirmwareI18n::Message::PleaseCompleteBeforeEnding;
      }
      else if (this->formsMeta->action == API::ResourceUsageFormActionType::TAKEOVER)
      {
         pageTitle = FirmwareI18n::Message::PleaseCompleteBeforeTakingOver;
      }


      if (this->formsMeta->resourceName.length() > 0)
      {
         resourceName = this->formsMeta->resourceName;
      }
   }

   std::string formName = "";
   if (this->formsMeta)
   {
      for (uint8_t i = 0; i < this->formsMeta->formCount && i < API::MAX_FORMS_PER_REQUEST; ++i)
      {
         if (this->formsMeta->forms[i].id == this->formsPage->formId)
         {
            formName = this->formsMeta->forms[i].name;
            break;
         }
      }
   }

   // Compact breadcrumb instead of three stacked headers: action context on the
   // first line, resource + form scope on the second.
   if (this->formsBreadcrumbLabel)
   {

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
         pageTitle = FirmwareI18n::Text::format(FirmwareI18n::Message::Breadcrumb, {pageTitle, FirmwareI18n::Text::literal(scope) /* i18n-data: Supplied form/resource name, field caption, description, option, hint or entered value; preserve exact contents. */});
      }
      FirmwareI18n::setLabel(this->formsBreadcrumbLabel, pageTitle);
   }

}

void FormsScreen::onFormsNext(lv_event_t *e)
{
   if (lv_event_get_code(e) != LV_EVENT_CLICKED)
   {
      return;
   }
   auto *self = static_cast<FormsScreen *>(lv_event_get_user_data(e));
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
void FormsScreen::onFormsBack(lv_event_t *e)
{
   if (lv_event_get_code(e) != LV_EVENT_CLICKED)
   {
      return;
   }
   auto *self = static_cast<FormsScreen *>(lv_event_get_user_data(e));
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
void FormsScreen::onFormsCancel(lv_event_t *e)
{
   if (lv_event_get_code(e) != LV_EVENT_CLICKED)
   {
      return;
   }
   auto *self = static_cast<FormsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   self->resetForm();
   if (self->formsCancelCallback)
   {
      self->formsCancelCallback();
   }
}

void FormsScreen::setFormsBusy(bool busy, const char *)
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
         FirmwareI18n::setLabel(this->formsNextLabel, this->formsIsLastField ? FirmwareI18n::Message::Submit : FirmwareI18n::Message::Next);
      }
   }
}

void FormsScreen::init()
{
   this->buildFormsView();
}
lv_obj_t *FormsScreen::getScreen()
{
   return this->screen;
}
void FormsScreen::loop()
{
}
std::string FormsScreen::getName()
{
   return "FormsScreen";
}
void FormsScreen::onScreenLeave()
{
   this->closeFormsEditor(false);
   this->submitError.clear();
}
void FormsScreen::destroy()
{
   this->submitError.clear();
   if (this->screen)
   {
      lv_obj_del(this->screen);
   }
   this->screen = nullptr;
   this->resetFormsState();
}
void FormsScreen::showSubmitError(const FirmwareI18n::Text &text)
{
   this->setFormsBusy(false);
   this->submitError.show(this->formsNextButton, text);
}
