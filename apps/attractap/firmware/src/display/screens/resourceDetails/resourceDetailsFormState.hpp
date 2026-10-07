#pragma once
#include "../../../api/api.hpp"
#include <lvgl.h>
class ResourceDetailsScreen;

struct ResourceDetailsFormState
{
protected:
    lv_obj_t *formsModalOverlay = nullptr;
    lv_obj_t *formsModalPanel = nullptr;
    lv_obj_t *formsModalContent = nullptr;
    lv_obj_t *formsModalList = nullptr;
    lv_obj_t *formsModalErrorLabel = nullptr;
    lv_obj_t *formsModalProgressLabel = nullptr;
    lv_obj_t *formsProgressBar = nullptr;
    lv_obj_t *formsBreadcrumbLabel = nullptr;
    lv_obj_t *formsCancelButton = nullptr;
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
    const API::ResourceUsageFormRequest *formsModalMeta = nullptr;
    const API::ResourceUsageFormFieldsPage *formsModalPage = nullptr;
    bool formsCanGoBack = false;
    bool formsIsLastField = false;
    struct SelectOptionEventData
    {
        ResourceDetailsScreen *self;
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
        ResourceDetailsScreen *owner = nullptr;
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
