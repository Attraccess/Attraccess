#pragma once

#include <functional>
#include <string>

#include "state.hpp"
#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../theme.hpp"
#include "../../shared/buttonError.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../../api/api.hpp"

// Usage forms (start / end / takeover): one field per page, fetched from the
// server. A routed screen shown over the resource the user is working on; the
// application owns the flow (drafts, field cache, submission) and feeds it.
class FormsScreen : public IScreen, protected FormsState
{
public:
    FormsScreen() : logger("FormsScreen") {}
    void init() override;
    void onScreenLeave() override;
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;
    bool parksOrigin() const override { return true; }

    void showForm(const API::ResourceUsageFormRequest &meta);
    void renderFormField(const API::ResourceUsageFormFieldsPage &page, bool canGoBack, bool isLast, uint32_t fieldNumber, uint32_t totalFields);
    void showFormPageErrors(const API::ResourceUsageFormPageResult &result);
    // The server could not take the page at all: shown in place on Next/Submit.
    void showSubmitError(const FirmwareI18n::Text &text);
    // Closes an open text editor; leaving the screen is the router's business.
    void resetForm();
    void setFormPageNextCallback(std::function<void(const API::FormPageSubmission &)> callback);
    void setFormPageBackCallback(std::function<void()> callback);
    void setFormsCancelCallback(std::function<void()> callback);

private:
    Logger logger;
    lv_obj_t *screen = nullptr;
    ButtonError submitError;

    void updateFormTitle();
    void createFormsEditor(lv_obj_t *overlay);
    void createSelectField(lv_obj_t *fieldContainer, FormFieldWidget &widget, const API::ResourceUsageFormField &field);
    static void onFormsNext(lv_event_t *e);
    static void onFormsBack(lv_event_t *e);
    static void onFormsCancel(lv_event_t *e);
    static void onFieldPreviewClick(lv_event_t *e);
    static void onFormsEditorKeyboardEvent(lv_event_t *e);
    static void onFormsEditorCancel(lv_event_t *e);
    static void onSelectOptionClick(lv_event_t *e);
    static void onSelectContainerSizeChanged(lv_event_t *e);
    void updateSelectButtonStyles(FormFieldWidget &widget);
    void updateSelectOptionLayout(FormFieldWidget &widget);
    void buildFormsView();
    void buildCurrentFormField();
    bool collectCurrentField(API::FormPageSubmission &outPage);
    FormFieldWidget *findFieldWidget(uint32_t formId, uint32_t fieldId);
    FormFieldWidget *findFieldWidgetByObject(lv_obj_t *object);
    void clearFormFieldErrors();
    void setFormsBusy(bool busy, const char *text = nullptr);
    void openFormsEditor(uint16_t widgetIndex);
    void closeFormsEditor(bool commit);
    void updateFieldPreview(FormFieldWidget &widget);
    void resetFormsState();
};
