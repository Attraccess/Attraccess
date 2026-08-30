#pragma once

#include <functional>

#include <string>

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../images/lockscreen_background_image.hpp"
#include "../../../utils.hpp"
#include "../../../api/api.hpp"

class ResourceDetailsScreen : public IScreen
{
public:
    enum resource_type_t
    {
        RESOURCE_TYPE_MACHINE,
        RESOURCE_TYPE_DOOR,
    };

    enum button_click_type_t
    {
        BUTTON_CLICK_TYPE_START_SESSION,
        BUTTON_CLICK_TYPE_STOP_SESSION,
        BUTTON_CLICK_TYPE_LOCK_DOOR,
        BUTTON_CLICK_TYPE_UNLOCK_DOOR,
        BUTTON_CLICK_TYPE_UNLATCH_DOOR,
        BUTTON_CLICK_TYPE_FLOW_BUTTON,
        BUTTON_CLICK_TYPE_LOGOUT,
    };

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
    void setSessionTimeoutTime(uint32_t sessionTimeoutTime);
    void setSessionTimeoutPaused(bool paused);
    void extendSessionTimeoutBy(uint32_t ms);

    struct UserDetails
    {
        std::string username;
        bool canManageResource;
        bool hasIntroduction;
        bool isIntroducer;
        bool requiresSupervisor;
    };
    void setUserDetails(UserDetails userDetails);

    struct ButtonClickEventData
    {
        ResourceDetailsScreen *self;
        button_click_type_t buttonClickType;
        char flowButtonId[API::MAX_FLOW_BUTTON_ID_LEN]; // valid when buttonClickType == BUTTON_CLICK_TYPE_FLOW_BUTTON
    };
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
    Logger logger;
    lv_obj_t *screen = nullptr;

    std::string loginUsernameCache;
    lv_obj_t *loginUserLabel = nullptr;

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

    API::ProjectsOfUserResponse projectsCache;
    uint32_t selectedProjectId = 0;
    std::string selectedProjectName;
    uint32_t projectsCurrentPage = 1;
    uint32_t projectsTotalCount = 0;
    uint32_t projectsPageLimit = API::MAX_PROJECTS_PER_PAGE;
    bool projectsHasMore = false;
    bool projectsDataInitialized = false;
    lv_obj_t *projectsButton = nullptr;
    lv_obj_t *projectsButtonLabel = nullptr;
    lv_obj_t *clearProjectButton = nullptr;
    lv_obj_t *projectsModal = nullptr;
    lv_obj_t *projectsModalPanel = nullptr;
    lv_obj_t *projectsListContainer = nullptr;
    lv_obj_t *projectsPaginationLabel = nullptr;
    lv_obj_t *projectsPrevButton = nullptr;
    lv_obj_t *projectsNextButton = nullptr;
    lv_obj_t *startSessionButton = nullptr;
    lv_obj_t *startSessionButtonLabel = nullptr;
    lv_obj_t *stopSessionButton = nullptr;
    lv_obj_t *stopSessionButtonLabel = nullptr;
    lv_obj_t *stopOtherUserNote = nullptr;
    lv_obj_t *doorControls = nullptr;
    lv_obj_t *unlatchDoorButton = nullptr;

    lv_obj_t *flowButtonsContainer = nullptr;
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
    lv_obj_t *formsBusyOverlay = nullptr;
    lv_obj_t *formsBusyLabel = nullptr;
    // Fullscreen text editor overlay: textarea on top, keyboard pinned below.
    lv_obj_t *formsEditorOverlay = nullptr;
    lv_obj_t *formsEditorTitleLabel = nullptr;
    lv_obj_t *formsEditorTextarea = nullptr;
    lv_obj_t *formsEditorSpacer = nullptr; // pushes keyboard to the bottom for one-line fields
    lv_obj_t *formsEditorKeyboard = nullptr;
    uint16_t formsEditorWidgetIndex = 0;
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

    void updateElapsedTimeDisplay();
    lv_obj_t *elapsedTime = nullptr;

    uint32_t sessionTimeoutTime = 0;
    bool sessionTimeoutPaused = false;
    uint32_t pauseFrozenAtMs = 0;
    lv_obj_t *sessionTimeoutIndicator = nullptr;
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

    // overlay/toast state
    lv_obj_t *actionOverlay = nullptr;
    lv_obj_t *actionOverlayLabel = nullptr;
    lv_obj_t *successToast = nullptr;
    lv_timer_t *successToastTimer = nullptr;

    struct ProjectButtonEventData
    {
        ResourceDetailsScreen *self;
        uint8_t index;
    };

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
    void disposeActionOverlay();
    void disposeSuccessToast();
    void resetFormsModalState();
};
