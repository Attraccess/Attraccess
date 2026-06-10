#include "resourceDetailsScreen.hpp"
#include <lvgl.h>
#include <time.h>
#include <stdio.h>

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
   this->formsKeyboard = nullptr;
   this->formsBackButton = nullptr;
   this->formsNextButton = nullptr;
   this->formsNextLabel = nullptr;
   this->formsCancelButton = nullptr;
   this->formsBusyOverlay = nullptr;
   this->formsBusyLabel = nullptr;
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

   this->hideFormsKeyboard();
   if (this->formsModalOverlay)
   {
      lv_obj_clear_flag(this->formsModalOverlay, LV_OBJ_FLAG_HIDDEN);
   }
   this->updateFormsModalLayoutForKeyboard(false);
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
      String progress = "Feld " + String(fieldNumber) + " / " + String(totalFields);
      lv_label_set_text(this->formsModalProgressLabel, progress.c_str());
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

   if (this->formsModalContent)
   {
      lv_obj_scroll_to_y(this->formsModalContent, 0, LV_ANIM_OFF);
   }
   this->hideFormsKeyboard();
   this->updateFormsModalLayoutForKeyboard(false);
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
   this->hideFormsKeyboard();
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

   lv_obj_t *content = lv_obj_create(panel);
   this->formsModalContent = content;
   lv_obj_remove_style_all(content);
   // the content container is the dedicated scroll root
   lv_obj_set_width(content, lv_pct(100));
   lv_obj_set_flex_flow(content, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(content, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
   lv_obj_set_style_pad_row(content, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(content, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_add_flag(content, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_scroll_dir(content, LV_DIR_VER);
   lv_obj_set_flex_grow(content, 1);

   this->formsModalProgressLabel = lv_label_create(content);
   lv_label_set_text(this->formsModalProgressLabel, "");
   lv_obj_set_style_text_color(this->formsModalProgressLabel, lv_color_hex(0x9CA3AF), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_text_font(this->formsModalProgressLabel, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);

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
   lv_obj_set_style_pad_row(list, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(list, 6, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *footer = lv_obj_create(content);
   lv_obj_remove_style_all(footer);
   lv_obj_remove_flag(footer, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_width(footer, lv_pct(100));
   lv_obj_set_height(footer, LV_SIZE_CONTENT);
   lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW_WRAP);
   lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_top(footer, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_column(footer, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_pad_row(footer, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *backBtn = lv_button_create(footer);
   this->formsBackButton = backBtn;
   lv_obj_set_width(backBtn, LV_SIZE_CONTENT);
   lv_obj_set_height(backBtn, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_all(backBtn, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_t *backLabel = lv_label_create(backBtn);
   lv_label_set_text(backLabel, "Zurueck");
   lv_obj_set_align(backLabel, LV_ALIGN_CENTER);
   lv_obj_add_event_cb(backBtn, &ResourceDetailsScreen::onFormsBack, LV_EVENT_CLICKED, this);

   lv_obj_t *cancelBtn = lv_button_create(footer);
   this->formsCancelButton = cancelBtn;
   lv_obj_set_width(cancelBtn, LV_SIZE_CONTENT);
   lv_obj_set_height(cancelBtn, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_all(cancelBtn, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_t *cancelLabel = lv_label_create(cancelBtn);
   lv_label_set_text(cancelLabel, "Abbrechen");
   lv_obj_set_align(cancelLabel, LV_ALIGN_CENTER);
   lv_obj_add_event_cb(cancelBtn, &ResourceDetailsScreen::onFormsCancel, LV_EVENT_CLICKED, this);

   lv_obj_t *nextBtn = lv_button_create(footer);
   this->formsNextButton = nextBtn;
   lv_obj_set_width(nextBtn, LV_SIZE_CONTENT);
   lv_obj_set_height(nextBtn, LV_SIZE_CONTENT);
   lv_obj_set_style_pad_all(nextBtn, 10, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_color(nextBtn, lv_color_hex(0x10B981), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(nextBtn, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
   this->formsNextLabel = lv_label_create(nextBtn);
   lv_label_set_text(this->formsNextLabel, "Weiter");
   lv_obj_set_align(this->formsNextLabel, LV_ALIGN_CENTER);
   lv_obj_add_event_cb(nextBtn, &ResourceDetailsScreen::onFormsNext, LV_EVENT_CLICKED, this);

   this->formsKeyboard = lv_keyboard_create(overlay);
   lv_obj_set_width(this->formsKeyboard, lv_pct(100));
   lv_obj_add_flag(this->formsKeyboard, LV_OBJ_FLAG_HIDDEN);
   lv_obj_add_event_cb(this->formsKeyboard, &ResourceDetailsScreen::onFormsKeyboardEvent, LV_EVENT_ALL, this);

   // Busy overlay: created last so it floats above the panel + keyboard. While
   // visible it blocks all input behind it (CLICKABLE) until the server responds.
   lv_obj_t *busy = lv_obj_create(overlay);
   this->formsBusyOverlay = busy;
   lv_obj_remove_style_all(busy);
   lv_obj_add_flag(busy, LV_OBJ_FLAG_IGNORE_LAYOUT);
   lv_obj_add_flag(busy, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_add_flag(busy, LV_OBJ_FLAG_HIDDEN);
   lv_obj_remove_flag(busy, LV_OBJ_FLAG_SCROLLABLE);
   lv_obj_set_size(busy, lv_pct(100), lv_pct(100));
   lv_obj_set_align(busy, LV_ALIGN_CENTER);
   lv_obj_set_style_bg_color(busy, lv_color_black(), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_bg_opa(busy, 160, LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_flex_flow(busy, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_flex_align(busy, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_row(busy, 10, LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *busySpinner = lv_spinner_create(busy);
   lv_obj_set_size(busySpinner, 48, 48);
   lv_obj_remove_flag(busySpinner, LV_OBJ_FLAG_CLICKABLE);

   this->formsBusyLabel = lv_label_create(busy);
   lv_label_set_text(this->formsBusyLabel, "Bitte warten");
   lv_obj_set_style_text_color(this->formsBusyLabel, lv_color_white(), LV_PART_MAIN | LV_STATE_DEFAULT);
}
void ResourceDetailsScreen::setFormsBusy(bool busy, const char *text)
{
   this->formsBusy = busy;
   if (busy)
   {
      this->hideFormsKeyboard();
   }
   if (this->formsBusyLabel && text)
   {
      lv_label_set_text(this->formsBusyLabel, text);
   }
   // Disable footer buttons as well so they read as inactive behind the overlay.
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
   // Back button stays disabled on the first field even when not busy.
   if (!busy && this->formsBackButton && !this->formsCanGoBack)
   {
      lv_obj_add_state(this->formsBackButton, LV_STATE_DISABLED);
   }
   if (this->formsBusyOverlay)
   {
      if (busy)
      {
         lv_obj_clear_flag(this->formsBusyOverlay, LV_OBJ_FLAG_HIDDEN);
         lv_obj_move_foreground(this->formsBusyOverlay);
      }
      else
      {
         lv_obj_add_flag(this->formsBusyOverlay, LV_OBJ_FLAG_HIDDEN);
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

   String pageTitle = "Bitte Formular ausfuellen";
   String resourceName = "";

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

   String formName = "";
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

   lv_obj_t *pageTitleLabel = lv_label_create(this->formsModalList);
   lv_label_set_text(pageTitleLabel, pageTitle.c_str());
   lv_obj_set_style_text_color(pageTitleLabel, lv_color_hex(0xE5E7EB), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_width(pageTitleLabel, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);

   lv_obj_t *resourceNameLabel = lv_label_create(this->formsModalList);
   lv_label_set_text(resourceNameLabel, resourceName.c_str());
   lv_obj_set_style_text_color(resourceNameLabel, lv_color_hex(0xE5E7EB), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_obj_set_style_width(resourceNameLabel, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);
   lv_label_set_long_mode(resourceNameLabel, LV_LABEL_LONG_WRAP);

   {
      lv_obj_t *formCard = lv_obj_create(this->formsModalList);
      lv_obj_remove_style_all(formCard);
      lv_obj_remove_flag(formCard, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_set_width(formCard, lv_pct(100));
      lv_obj_set_height(formCard, LV_SIZE_CONTENT);
      lv_obj_set_style_bg_color(formCard, lv_color_hex(0x1F2937), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_bg_opa(formCard, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_radius(formCard, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_all(formCard, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_pad_row(formCard, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_flex_flow(formCard, LV_FLEX_FLOW_COLUMN);
      lv_obj_set_flex_align(formCard, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

      lv_obj_t *formTitle = lv_label_create(formCard);
      lv_label_set_text(formTitle, formName.c_str());
      lv_obj_set_style_text_font(formTitle, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_obj_set_style_text_color(formTitle, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
      lv_label_set_long_mode(formTitle, LV_LABEL_LONG_WRAP);
      lv_obj_set_style_width(formTitle, lv_pct(100), LV_PART_MAIN | LV_STATE_DEFAULT);

      {
         const API::ResourceUsageFormField &field = this->formsModalPage->fields[0];
         lv_obj_t *fieldContainer = lv_obj_create(formCard);
         lv_obj_remove_style_all(fieldContainer);
         lv_obj_remove_flag(fieldContainer, LV_OBJ_FLAG_SCROLLABLE);
         lv_obj_set_width(fieldContainer, lv_pct(100));
         lv_obj_set_height(fieldContainer, LV_SIZE_CONTENT);
         lv_obj_set_flex_flow(fieldContainer, LV_FLEX_FLOW_COLUMN);
         lv_obj_set_flex_align(fieldContainer, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
         lv_obj_set_style_pad_row(fieldContainer, 2, LV_PART_MAIN | LV_STATE_DEFAULT);

         String fieldTitle = field.name;
         if (field.isRequired)
         {
            fieldTitle += " *";
         }
         lv_obj_t *fieldLabel = lv_label_create(fieldContainer);
         lv_label_set_text(fieldLabel, fieldTitle.c_str());
         lv_obj_set_style_text_color(fieldLabel, lv_color_hex(0xE5E5E5), LV_PART_MAIN | LV_STATE_DEFAULT);
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
         widget.errorLabel = nullptr;
         widget.definition = &field;
         widget.owner = this;
         widget.selectOptionEventCount = 0;

         if (field.type == API::ResourceUsageFormFieldType::BOOLEAN)
         {
            lv_obj_t *sw = lv_switch_create(fieldContainer);
            widget.input = sw;
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
            lv_obj_t *ta = lv_textarea_create(fieldContainer);
            widget.input = ta;
            if (field.hasValue && field.value.length() > 0)
            {
               lv_textarea_set_text(ta, field.value.c_str());
            }
            lv_obj_set_width(ta, lv_pct(100));
            lv_obj_set_style_bg_color(ta, lv_color_hex(0x374151), LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_text_color(ta, lv_color_hex(0xFFFFFF), LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_pad_left(ta, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
            lv_obj_set_style_pad_right(ta, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
            bool multiline = field.type == API::ResourceUsageFormFieldType::TEXT && field.options.text.multiline;
            lv_textarea_set_one_line(ta, !multiline);
            if (field.type == API::ResourceUsageFormFieldType::TEXT && field.options.text.hasPlaceholder)
            {
               lv_textarea_set_placeholder_text(ta, field.options.text.placeholder.c_str());
            }
            if (field.type == API::ResourceUsageFormFieldType::NUMBER)
            {
               lv_textarea_set_accepted_chars(ta, "0123456789-.");
               lv_textarea_set_one_line(ta, true);
            }
            lv_obj_add_event_cb(ta, &ResourceDetailsScreen::onFormFieldFocus, LV_EVENT_CLICKED, this);
            lv_obj_add_event_cb(ta, &ResourceDetailsScreen::onFormFieldFocus, LV_EVENT_FOCUSED, this);
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

      const char *rawText = widget.input ? lv_textarea_get_text(widget.input) : "";
      String value = rawText ? String(rawText) : "";
      value.trim();

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
         answer.numberValue = value.toDouble();
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
void ResourceDetailsScreen::hideFormsKeyboard()
{
   if (!this->formsKeyboard)
   {
      return;
   }
   lv_obj_add_flag(this->formsKeyboard, LV_OBJ_FLAG_HIDDEN);
   lv_keyboard_set_textarea(this->formsKeyboard, nullptr);
   this->updateFormsModalLayoutForKeyboard(false);
}
void ResourceDetailsScreen::updateFormsModalLayoutForKeyboard(bool keyboardVisible)
{
   (void)keyboardVisible;
   if (!this->formsModalOverlay)
   {
      return;
   }
   lv_obj_mark_layout_as_dirty(this->formsModalOverlay);
   lv_obj_update_layout(this->formsModalOverlay);
}
void ResourceDetailsScreen::showKeyboardForWidget(FormFieldWidget &widget, lv_obj_t *target)
{
   if (!this->formsKeyboard)
   {
      return;
   }
   lv_keyboard_set_textarea(this->formsKeyboard, target);
   lv_keyboard_mode_t mode = LV_KEYBOARD_MODE_TEXT_LOWER;
   if (widget.type == API::ResourceUsageFormFieldType::NUMBER)
   {
      mode = LV_KEYBOARD_MODE_NUMBER;
   }
   lv_keyboard_set_mode(this->formsKeyboard, mode);
   lv_obj_clear_flag(this->formsKeyboard, LV_OBJ_FLAG_HIDDEN);
   // Use recursive scroll to ensure nested containers (form cards inside the modal list)
   // adjust even when the keyboard shrinks the available viewport.
   lv_obj_scroll_to_view_recursive(target, LV_ANIM_OFF);
   this->updateFormsModalLayoutForKeyboard(true);
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
void ResourceDetailsScreen::onFormFieldFocus(lv_event_t *e)
{
   auto code = lv_event_get_code(e);
   if (code != LV_EVENT_CLICKED && code != LV_EVENT_FOCUSED)
   {
      return;
   }
   auto *self = static_cast<ResourceDetailsScreen *>(lv_event_get_user_data(e));
   if (!self)
   {
      return;
   }
   lv_obj_t *target = static_cast<lv_obj_t *>(lv_event_get_target(e));
   FormFieldWidget *widget = self->findFieldWidgetByObject(target);
   if (!widget)
   {
      self->hideFormsKeyboard();
      return;
   }
   if (widget->type == API::ResourceUsageFormFieldType::BOOLEAN || widget->type == API::ResourceUsageFormFieldType::SELECT)
   {
      self->hideFormsKeyboard();
      return;
   }
   self->showKeyboardForWidget(*widget, target);
}
void ResourceDetailsScreen::onFormsKeyboardEvent(lv_event_t *e)
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
   self->hideFormsKeyboard();
}
void ResourceDetailsScreen::onSelectOptionClick(lv_event_t *e)
{
   auto *evtData = static_cast<SelectOptionEventData *>(lv_event_get_user_data(e));
   if (!evtData || !evtData->self)
   {
      return;
   }

   auto *self = evtData->self;
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
