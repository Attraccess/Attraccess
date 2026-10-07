#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

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
      lv_label_set_text(loading, "Laden...");
      lv_obj_set_style_text_color(loading, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
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
      lv_label_set_text(this->formsModalErrorLabel, shown ? "Bitte Eingabe korrigieren." : "Eingabe ungültig.");
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
