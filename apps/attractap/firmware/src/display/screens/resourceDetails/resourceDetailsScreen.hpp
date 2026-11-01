#pragma once

#include <functional>
#include "resourceDetailsTypes.hpp"
#include "resourceDetailsUsageState.hpp"

#include <string>

#include "../IScreen.hpp"
#include "../../../logger/logger.hpp"
#include "../../theme.hpp"
#include "../../shared/sessionHeader.hpp"
#include "../../shared/actionOverlay.hpp"
#include "../../shared/buttonError.hpp"
#include "../../../utils.hpp"
#include "../../../api/api.hpp"

class ResourceDetailsScreen : public ResourceDetailsTypes, public IScreen, protected ResourceDetailsUsageState
{
public:

    ResourceDetailsScreen() : logger("ResourceDetailsScreen"), loginUsernameCache("INITIAL_VALUE")
    {
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
    void setProjectSelectionCallback(std::function<void(uint32_t, const std::string &)> callback);
    // The project button opens the project picker, which the application routes.
    void setOpenProjectsCallback(std::function<void()> callback);
    void setSelectedProject(uint32_t projectId, const char *projectName);

    // UI helpers for async actions
    void showActionProgress(const FirmwareI18n::Text &text);
    void hideActionProgress();
    // Shows `text` in place on the button that started the failed action;
    // false when that button is not on screen.
    bool showActionError(const FirmwareI18n::Text &text);

private:
    void createResourceHeader();
    void createSessionDetails();
    void createSessionControls();
    void createDoorControls();
    void createStatusPanels();
    Logger logger;
    lv_obj_t *screen = nullptr;
    lv_obj_t *body = nullptr; // the scrolling part under the session header

    std::string loginUsernameCache;
    SessionHeader sessionHeader;
    ActionOverlay actionOverlay;
    FirmwareI18n::Text actionTitle;

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
    std::function<void(uint32_t, const std::string &)> projectSelectionCallback;
    static void onButtonClick(lv_event_t *e);
    static void onContainerDelete(lv_event_t *e);
    static void onProjectsButtonClick(lv_event_t *e);
    static void onClearProjectSelectionClick(lv_event_t *e);

    lv_obj_t *noIntroductionPanel = nullptr;
    lv_obj_t *introducersListLabel = nullptr;
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

    // Project selection state shown on the button; the picker is its own screen.
    uint32_t selectedProjectId = 0;
    std::string selectedProjectName;
    lv_obj_t *projectsButton = nullptr;
    lv_obj_t *projectsButtonLabel = nullptr;
    lv_obj_t *clearProjectButton = nullptr;
    std::function<void()> openProjectsCallback;
    ButtonError actionError;

    void refreshProjectsButtonLabel();
    void updateClearProjectButtonState();
    void clearSelectedProject();
    void applyCachedState();
    void hideActionProgressVisual();
};
