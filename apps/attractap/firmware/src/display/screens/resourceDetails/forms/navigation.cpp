#include "../resourceDetailsScreen.hpp"
#include "../../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "text.hpp"

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
   this->formsEditorInitialText.clear();
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
      FirmwareI18n::setLabel(loading, FirmwareI18n::Message::Loading);
      lv_obj_set_style_text_color(loading, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   }
   if (this->formsModalErrorLabel)
   {
      FirmwareI18n::setLabel(this->formsModalErrorLabel, FirmwareI18n::Text::literal(""));
   }
   if (this->formsModalProgressLabel)
   {
      FirmwareI18n::setLabel(this->formsModalProgressLabel, FirmwareI18n::Text::literal(""));
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
      FirmwareI18n::setDynamicLabel(this->formsModalProgressLabel, progress.c_str());
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
         FirmwareI18n::setLabel(widget->errorLabel, FirmwareI18n::formError(result.errors[i].code));
         shown = true;
      }
   }
   if (this->formsModalErrorLabel)
   {
      FirmwareI18n::setLabel(this->formsModalErrorLabel, shown ? FirmwareI18n::Message::PleaseCorrectYourInput : FirmwareI18n::Message::InvalidInput);
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
   lv_obj_set_style_bg_color(overlay, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(overlay, 170, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_all(overlay, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(overlay, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(overlay, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

   lv_obj_t *panel = lv_obj_create(overlay);
   this->formsModalPanel = panel;
   lv_obj_remove_style_all(panel);
   lv_obj_set_size(panel, lv_pct(100), lv_pct(100));
   lv_obj_set_style_max_width(panel, LV_COORD_MAX, LV_PART_MAIN | LV_STATE_DEFAULT);
   DisplayTheme::applySurface(panel);
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
   FirmwareI18n::setLabel(this->formsModalProgressLabel, FirmwareI18n::Text::literal(""));
   lv_obj_set_style_text_color(this->formsModalProgressLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->formsModalProgressLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);


   lv_obj_t *cancelBtn = lv_button_create(header);
   this->formsCancelButton = cancelBtn;
   lv_obj_remove_style_all(cancelBtn);
   lv_obj_set_size(cancelBtn, 34, 34);
   DisplayTheme::secondaryButton(cancelBtn);
   lv_obj_t *cancelLabel = lv_label_create(cancelBtn);
   FirmwareI18n::setLabel(cancelLabel, FirmwareI18n::Text::literal(LV_SYMBOL_CLOSE));
   lv_obj_center(cancelLabel);
   lv_obj_add_event_cb(cancelBtn, &ResourceDetailsScreen::onFormsCancel, LV_EVENT_CLICKED, this);


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
   FirmwareI18n::setLabel(this->formsBreadcrumbLabel, FirmwareI18n::Text::literal(""));
    lv_obj_set_style_text_color(this->formsBreadcrumbLabel, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->formsBreadcrumbLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_width(this->formsBreadcrumbLabel, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_label_set_long_mode(this->formsBreadcrumbLabel, LV_LABEL_LONG_WRAP);

   this->formsModalErrorLabel = lv_label_create(content);
   FirmwareI18n::setLabel(this->formsModalErrorLabel, FirmwareI18n::Text::literal(""));
    lv_obj_set_style_text_color(this->formsModalErrorLabel, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(this->formsModalErrorLabel, &attractap_font_montserrat_latin1_14, LV_PART_MAIN | LV_STATE_DEFAULT);


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
   DisplayTheme::secondaryButton(backBtn);
   lv_obj_t *backLabel = lv_label_create(backBtn);
   FirmwareI18n::setLabel(backLabel, FirmwareI18n::Message::Back);
   lv_obj_set_style_text_font(backLabel, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);
   lv_obj_set_align(backLabel, LV_ALIGN_CENTER);
   lv_obj_add_event_cb(backBtn, &ResourceDetailsScreen::onFormsBack, LV_EVENT_CLICKED, this);

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
   lv_obj_add_event_cb(nextBtn, &ResourceDetailsScreen::onFormsNext, LV_EVENT_CLICKED, this);

   this->createFormsEditor(overlay);

}

#include <string.h>
#include "../resourceDetailsCopy.hpp"

void ResourceDetailsScreen::updateFormBreadcrumb()
{

   FirmwareI18n::Text pageTitle = FirmwareI18n::Message::PleaseCompleteTheForm;
   std::string resourceName = "";

   if (this->formsModalMeta)
   {
      if (this->formsModalMeta->action == API::ResourceUsageFormActionType::START)
      {
         pageTitle = FirmwareI18n::Message::PleaseCompleteBeforeStarting;
      }
      else if (this->formsModalMeta->action == API::ResourceUsageFormActionType::END)
      {
         pageTitle = FirmwareI18n::Message::PleaseCompleteBeforeEnding;
      }
      else if (this->formsModalMeta->action == API::ResourceUsageFormActionType::TAKEOVER)
      {
         pageTitle = FirmwareI18n::Message::PleaseCompleteBeforeTakingOver;
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
         pageTitle = FirmwareI18n::Text::format(FirmwareI18n::Message::Breadcrumb, {pageTitle, FirmwareI18n::Text::literal(scope)});
      }
      FirmwareI18n::setLabel(this->formsBreadcrumbLabel, pageTitle);
   }

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
         FirmwareI18n::setLabel(this->formsNextLabel, this->formsIsLastField ? FirmwareI18n::Message::Submit : FirmwareI18n::Message::Next);
      }
   }
}
