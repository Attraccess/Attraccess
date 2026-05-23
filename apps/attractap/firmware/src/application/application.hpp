#pragma once

#include <Arduino.h>
#include "../nfc/nfc.hpp"
#include "../logger/logger.hpp"
#include "settings/settings.hpp"
#include "../network/network.hpp"
#include "../api/api.hpp"
#include "../utils.hpp"
#include "../beeper/beeper.hpp"

#ifdef HAS_IO_EXPANDER
#include "../ioexpander/ioexpander.hpp"
#endif

#ifdef HAS_WS2812_LED
#include "../led/led.hpp"
#endif

#ifdef HAS_LVGL_DISPLAY
#include "../display/display.hpp"
#else
#define NFC_CARD_LONG_PRESENTATION_TIME_MS 1500
#endif

#define APPLICATION_BOOT_SCREEN_DURATION 2000

class Application
{
public:
    Application() : logger("Application"),
                    api(),
                    externalState(EXTERNAL_STATE_NONE),
                    firmwareUpdateProgressPct(0),
                    unlocked(false)
#ifdef HAS_LVGL_DISPLAY
                    ,
                    resourceCount(0),
                    resourceIsSelected(false),
                    bootDone(false),
                    resourceListUpdated(false),
                    selectedResourceChanged(false)
#endif
    {
    }

    void setup();
    void loop();

private:
#ifdef HAS_IO_EXPANDER
    IOExpander ioExpander;
#endif
    NFC nfc;
    Logger logger;
    API api;
    Beeper beeper;

#ifdef HAS_WS2812_LED
    LedController led;
    void updateLedState();
#endif

    enum ExternalStates_t
    {
        EXTERNAL_STATE_NONE,
#ifdef HAS_LVGL_DISPLAY
        EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
        EXTERNAL_STATE_ENROLL_NEW_CARD,
#endif
        EXTERNAL_STATE_AUTHENTICATE_CARD,
        EXTERNAL_STATE_FIRMWARE_UPDATE,
    };

    ExternalStates_t externalState;

#ifdef HAS_LVGL_DISPLAY
    struct ApiEnrollNewCardGetAvailableKeyNoData_t
    {
        String username;
    };
    ApiEnrollNewCardGetAvailableKeyNoData_t apiEnrollNewCardGetAvailableKeyNoData;
    uint32_t apiEnrollNewCardGetAvailableKeyNoStartTimeMs;

    struct ApiEnrollNewCardData_t
    {
        uint8_t keyNo;
        uint8_t keyBytes[16];
    };
    ApiEnrollNewCardData_t apiEnrollNewCardData;
#endif

    API::CardAuthenticationDetailsResponse cardAuthenticationData;

    int firmwareUpdateProgressPct;

    String availableFirmwareVersion;

    static void
    networkTask(void *parameter);

#ifdef HAS_WS2812_LED
    static void ledTask(void *parameter);
#endif

    void processState();

#ifdef HAS_LVGL_DISPLAY
    void handleConnectionConfigurationSave(const ConnectionConfigurationScreen::ConnectionConfig &cfg);

    void handleTouch(int16_t x, int16_t y);

    uint32_t bootTime;
    bool bootDone;

#endif
    bool unlocked;
#ifdef HAS_LVGL_DISPLAY

    uint32_t timeOfUnlockedMs;
    const uint32_t UNLOCKED_TIMEOUT_MS = 30000;
    void restartSessionTimeout();
    void resetPauseAccounting();
    void resetSessionOnDisconnect();

    uint32_t timeOfResourceSelectionMs;
    const uint32_t RESOURCE_SELECTION_TIMEOUT_MS = 10000;
    void restartResourceSelectionTimeout();

    uint8_t resourceCount;
    bool resourceIsSelected;
#else
    bool resourceIsDoor = false;
#endif
    uint32_t selectedResourceId;

#ifndef HAS_LVGL_DISPLAY
    bool cardDetected = false;
    bool cardRemoved = false;
    unsigned long cardDetectionTimeMs = 0;
    bool cardPresentationWasLong = false;
#endif

#ifdef HAS_LVGL_DISPLAY
    bool selectedResourceChanged;
    // Own a persistent copy of the latest resource list to avoid dangling references
    API::ResourceList resourceList;
    bool resourceListUpdated;

    API::ProjectsOfUserResponse projectsOfUserResponse;
    bool projectsOfUserResponseUpdated = false;
    uint32_t selectedProjectId = 0;
    String selectedProjectName;
    uint32_t projectsCurrentPage = 1;
    uint32_t projectsTotalCount = 0;
    bool projectsHasMore = false;
    String currentProjectsUser;

    enum pending_action_t
    {
        PENDING_ACTION_NONE,
        PENDING_ACTION_START_SESSION,
        PENDING_ACTION_STOP_SESSION,
    };
    pending_action_t pendingActionType = PENDING_ACTION_NONE;
    uint32_t pendingActionResourceId = 0;
    uint32_t pendingActionProjectId = 0;
    bool hasPendingFormRequest = false;
    // Flag set by websocket callback when a form request arrives; processed by main loop
    volatile bool pendingFormRequestReady = false;
    API::ResourceUsageFormRequest pendingFormRequest;
    API::FormSubmissionList formSubmissionBuffer;

    void selectResource(const API::ResourceBrief &resource);

    void requestProjectsPage(uint32_t page);
    void clearProjectSelection();
    void handleProjectSelection(uint32_t projectId, const String &projectName);
    void handleFormsRequest(const API::ResourceUsageFormRequest &request);
    void handleFormsSubmit(const API::FormSubmissionList &submissions);
    void handleFormsCancel();
    void onActionResult(const String &eventType);
#endif

    enum applicationState_t
    {
#ifdef HAS_LVGL_DISPLAY
        APPLICATION_STATE_BOOT,
        APPLICATION_STATE_PIN_NOT_SET,
#endif
        APPLICATION_STATE_CONFIGURATION_REQUIRED,
        APPLICATION_STATE_INIT,
        APPLICATION_STATE_CUSTOM,
#ifdef HAS_LVGL_DISPLAY
        APPLICATION_STATE_LOCKED,
#endif
        APPLICATION_STATE_AUTHENTICATE_CARD,
        APPLICATION_STATE_NO_RESOURCES,
#ifdef HAS_LVGL_DISPLAY
        APPLICATION_STATE_RESOURCE_LIST,
        APPLICATION_STATE_UNLOCKED,
        APPLICATION_STATE_ENROLLMENT,
#else
        APPLICATION_STATE_WAIT_FOR_CARD,
#endif
        APPLICATION_STATE_FIRMWARE_UPDATE
    };
    applicationState_t state;

#ifdef HAS_LVGL_DISPLAY
    void handleResourceListUpdate(const API::ResourceList &resourceList);
#endif
    void processCardAuthenticationData();

#ifdef HAS_LVGL_DISPLAY
    void handleResourceDetailsButtonClick(ResourceDetailsScreen::ButtonClickEventData evt);

    // Action pause tracking (while server actions are running)
    void beginActionPause();
    void endActionPause();

    uint32_t pauseStartMs = 0;
    uint32_t accumulatedPauseMs = 0;
    uint16_t actionInProgressCount = 0;
#endif
};