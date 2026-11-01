#pragma once
#include "../../../api/api.hpp"
#include <lvgl.h>
class FormsScreen;

struct FormsState
{
protected:
    lv_obj_t *formsPanel = nullptr;
    lv_obj_t *formsContent = nullptr;
    lv_obj_t *formsList = nullptr;
    lv_obj_t *formsErrorLabel = nullptr;
    lv_obj_t *formsProgressLabel = nullptr;
    lv_obj_t *formsProgressBar = nullptr;
    lv_obj_t *formsTitleLabel = nullptr;
    lv_obj_t *formsSubtitleLabel = nullptr;
    lv_obj_t *formsBackButton = nullptr;
    lv_obj_t *formsNextButton = nullptr;
    lv_obj_t *formsNextLabel = nullptr;
    lv_obj_t *formsNextSpinner = nullptr;
    // Fullscreen text editor overlay: textarea on top, keyboard pinned below.
    lv_obj_t *formsEditorOverlay = nullptr;
    lv_obj_t *formsEditorTitleLabel = nullptr;
    lv_obj_t *formsEditorTextarea = nullptr;
    lv_obj_t *formsEditorSpacer = nullptr; // pushes keyboard to the bottom for one-line fields
    lv_obj_t *formsEditorKeyboard = nullptr;
    uint16_t formsEditorWidgetIndex = 0;
    std::string formsEditorInitialText;
    bool formsBusy = false;
    const API::ResourceUsageFormRequest *formsMeta = nullptr;
    const API::ResourceUsageFormFieldsPage *formsPage = nullptr;
    bool formsCanGoBack = false;
    bool formsIsLastField = false;
    struct SelectOptionEventData
    {
        FormsScreen *self;
        uint16_t widgetIndex = 0;
        uint8_t optionIndex = 0; // 1-based (0 = none)
    };

    struct FormFieldWidget
    {
        uint32_t formId;
        uint32_t fieldId;
        API::ResourceUsageFormFieldType type;
        bool isRequired;
        lv_obj_t *input = nullptr;
        lv_obj_t *previewLabel = nullptr; // value preview inside the tap-to-edit box (text/number fields)
        std::string textValue;            // committed value for text/number fields (edited via the fullscreen editor)
        lv_obj_t *errorLabel = nullptr;
        const API::ResourceUsageFormField *definition = nullptr;
        uint8_t selectedOptionIndex = 0; // For SELECT: 0 = no selection, 1+ = option index
        FormsScreen *owner = nullptr;
        uint16_t widgetIndex = 0;
        SelectOptionEventData selectOptionEvents[API::MAX_SELECT_OPTIONS];
        uint8_t selectOptionEventCount = 0;
    };

    FormFieldWidget formFieldWidgets[API::MAX_FORM_PAGE_FIELDS];
    uint16_t formFieldWidgetCount = 0;
    API::FormPageSubmission formPageScratch;
    std::function<void(const API::FormPageSubmission &)> formPageNextCallback;
    std::function<void()> formPageBackCallback;
    std::function<void()> formsCancelCallback;

};
