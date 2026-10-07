#pragma once

#include <functional>
#include "resourceDetailsTypes.hpp"
#include "resourceDetailsFormState.hpp"
#include "resourceDetailsProjectState.hpp"
#include "resourceDetailsUsageState.hpp"

#include <string>

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "display/theme.hpp"
#include "display/shared/sessionHeader.hpp"
#include "display/shared/actionOverlay.hpp"
#include "../../../utils.hpp"
#include "../../../api/api.hpp"

class ResourceDetailsScreen : public ResourceDetailsTypes, public IScreen, protected ResourceDetailsFormState, protected ResourceDetailsProjectState, protected ResourceDetailsUsageState
{
public:

    ResourceDetailsScreen() : logger("ResourceDetailsScreen"), loginUsernameCache("INITIAL_VALUE")
    {
        this->projectsCache.count = 0;
    }
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

    void setResourceAndUsageDetails(const API::ResourceBrief &resource);
    void setUsageStats(const API::UsageStats &stats);
    void setSessionTimeoutTime(uint32_t sessionTimeoutTime);
    void setSessionTimeoutPaused(bool paused);
    void extendSessionTimeoutBy(uint32_t ms);

    void setUserDetails(UserDetails userDetails);

    void setButtonClickCallback(std::function<void(ButtonClickEventData)> callback);
    void setProjectsPageRequestCallback(std::function<void(uint32_t)> callback);
    void setProjectSelectionCallback(std::function<void(uint32_t, const std::string &)> callback);
    void setSelectedProject(uint32_t projectId, const char *projectName);
    void showFormsModal(const API::ResourceUsageFormRequest &meta);
    void renderFormField(const API::ResourceUsageFormFieldsPage &page, bool canGoBack, bool isLast, uint32_t fieldNumber, uint32_t totalFields);
    void showFormPageErrors(const API::ResourceUsageFormPageResult &result);
    void hideFormsModal();
    void setFormPageNextCallback(std::function<void(const API::FormPageSubmission &)> callback);
    void setFormPageBackCallback(std::function<void()> callback);
    void setFormsCancelCallback(std::function<void()> callback);

    // UI helpers for async actions
    void showActionProgress(const char *text);
    void hideActionProgress();
    void showSuccessToast(const char *text, uint16_t ms = 1200);

    void setProjects(const API::ProjectsOfUserResponse &projects);

private:
    void updateFormBreadcrumb();
    void createFormsEditor(lv_obj_t *overlay);
    void createSelectField(lv_obj_t *fieldContainer, FormFieldWidget &widget, const API::ResourceUsageFormField &field);
    void createResourceHeader();
    void createSessionDetails();
    void createSessionControls();
    void createDoorControls();
    void createStatusPanels();
    Logger logger;
    lv_obj_t *screen = nullptr;

    std::string loginUsernameCache;
    SessionHeader sessionHeader;
    ActionOverlay actionOverlay;
    std::string actionTitle;

    lv_obj_t *sessionDetailsContainer = nullptr;
    time_t sessionStartTime = 0;

    lv_obj_t *resourceName = nullptr;
    lv_obj_t *resourceDescription = nullptr;
    lv_obj_t *sessionStartTimeLabel = nullptr;
    lv_obj_t *currentUser = nullptr;

    lv_obj_t *sessionControls = nullptr;
    lv_obj_t *projectSelectionRow = nullptr;

    API::ResourceBrief resourceCache{};
    bool resourceCacheValid = false;

    UserDetails userDetailsCache{};
    bool userDetailsInitialized = false;

    lv_obj_t *startSessionButton = nullptr;
    lv_obj_t *startSessionButtonLabel = nullptr;
    lv_obj_t *stopSessionButton = nullptr;
    lv_obj_t *stopSessionButtonLabel = nullptr;
    lv_obj_t *stopOtherUserNote = nullptr;
    lv_obj_t *doorControls = nullptr;

    lv_obj_t *flowButtonsContainer = nullptr;

    void updateUsageStatsDisplay();
    void updateElapsedTimeDisplay();
    lv_obj_t *elapsedTime = nullptr;

    void updateSessionTimeoutIndicator();

    std::function<void(ButtonClickEventData)> buttonClickCallback;
    std::function<void(uint32_t)> projectsPageRequestCallback;
    std::function<void(uint32_t, const std::string &)> projectSelectionCallback;
    static void onButtonClick(lv_event_t *e);
    static void onContainerDelete(lv_event_t *e);
    static void onToastDelete(lv_event_t *e);
    static void onProjectsButtonClick(lv_event_t *e);
    static void onClearProjectSelectionClick(lv_event_t *e);
    static void onProjectsModalClose(lv_event_t *e);
    static void onProjectListItemClick(lv_event_t *e);
    static void onProjectListItemDelete(lv_event_t *e);
    static void onProjectsPrevPage(lv_event_t *e);
    static void onProjectsNextPage(lv_event_t *e);
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

    lv_obj_t *noIntroductionPanel;
    lv_obj_t *introducersListLabel;
    lv_obj_t *maintenancePanel = nullptr;
    lv_obj_t *maintenanceIntroducersLabel = nullptr;
    lv_obj_t *healthPanel = nullptr;
    lv_obj_t *healthReasonLabel = nullptr;
    std::string buildIntroducersText(const API::ResourceBrief &resource);
    void refreshAccessState();

    // The action that initiated the current request shows its progress inline.
    lv_obj_t *activeActionButton = nullptr;
    lv_obj_t *activeActionLabel = nullptr;
    lv_obj_t *activeActionSpinner = nullptr;
    bool actionInProgress = false;
    lv_obj_t *successToast = nullptr;
    lv_timer_t *successToastTimer = nullptr;

    void refreshProjectsButtonLabel();
    void updateClearProjectButtonState();
    void clearSelectedProject();
    void ensureProjectsModal();
    void showProjectsModal();
    void hideProjectsModal();
    void rebuildProjectsList();
    void showProjectsLoading();
    void updateProjectsPaginationControls();
    void ensureFormsModal();
    void buildCurrentFormField();
    bool collectCurrentField(API::FormPageSubmission &outPage);
    FormFieldWidget *findFieldWidget(uint32_t formId, uint32_t fieldId);
    FormFieldWidget *findFieldWidgetByObject(lv_obj_t *object);
    void clearFormFieldErrors();
    void setFormsBusy(bool busy, const char *text = nullptr);
    void openFormsEditor(uint16_t widgetIndex);
    void closeFormsEditor(bool commit);
    void updateFieldPreview(FormFieldWidget &widget);
    void applyCachedState();
    void disposeProjectsModal();
    void disposeFormsModal();
    void disposeSuccessToast();
    void hideActionProgressVisual();
    void resetFormsModalState();
};
