#pragma once

#include <Arduino.h>
#include <Preferences.h>
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

    // Enrollment is a self-contained, sticky sub-flow. Once started it owns the
    // display until it reaches a terminal state (success, cancel or timeout) so
    // the generic screen routing can never steal the enrollment screen. The
    // whole flow is poll-driven (card detection stays disabled), which removes
    // the old dependency on a fresh card-detection edge for the key-write step
    // (the "jiggle the card to get a beep" symptom).
    enum EnrollmentPhase_t
    {
        ENROLL_PHASE_NONE,
        ENROLL_PHASE_WAIT_FOR_CARD, // screen up, probing for a writable card
        ENROLL_PHASE_REQUESTED_KEY, // asked server for key material, awaiting it
        ENROLL_PHASE_WRITING,       // writing the key to the (still-present) card
        ENROLL_PHASE_SUCCESS,       // success shown, dwelling before exit
        ENROLL_PHASE_ERROR,         // error shown, dwelling before retry
    };
    EnrollmentPhase_t enrollPhase = ENROLL_PHASE_NONE;
    volatile bool enrollKeyMaterialReady = false;
    volatile bool enrollCancelRequested = false;
    volatile bool enrollErrorPending = false;
    // Fixed buffer, not an Arduino String: the producer runs on the websocket
    // task and the consumer on the main loop. A String would reallocate its
    // heap buffer on assignment, which the main loop could observe mid-update
    // (dangling pointer / torn read). A plain char[] has no pointer to dangle.
    char enrollErrorMessage[64] = {0};
    uint32_t enrollPhaseChangedMs = 0;
    static constexpr uint32_t ENROLLMENT_TIMEOUT_MS = 30000;
    static constexpr uint32_t ENROLL_SUCCESS_DWELL_MS = 1500;
    static constexpr uint32_t ENROLL_ERROR_DWELL_MS = 1800;
    void beginEnrollment();
    void processEnrollment();
    void exitEnrollment();
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

    // Persistent boot/crash diagnostics stored in NVS. The record describes the
    // currently running session and is refreshed periodically so the last value
    // before a freeze/crash survives the reboot.
    struct BootDiagnostics_t
    {
        uint32_t magic;
        uint8_t resetReason;
        uint32_t uptimeMs;
        uint32_t freeInternalHeap;
        uint32_t largestFreeBlock;
        bool websocketConnected;
        bool wifiConnected;
    };

    Preferences bootDiagPreferences;
    uint32_t lastBootSnapshotMs = 0;

    void setupBootDiagnostics();
    void snapshotBootDiagnostics();

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
    // Flags set by websocket callbacks when form events arrive; processed by LVGL thread
    volatile bool pendingFormRequestReady = false;
    volatile bool pendingFormFieldsReady = false;
    volatile bool pendingFormPageResultReady = false;
    API::ResourceUsageFormRequest pendingFormRequest;
    API::ResourceUsageFormFieldsPage pendingFormFields;
    API::ResourceUsageFormPageResult pendingFormPageResult;
    uint8_t formCursorFormIdx = 0;
    uint32_t formCursorOffset = 0;

    void selectResource(const API::ResourceBrief &resource);

    void requestProjectsPage(uint32_t page);
    void clearProjectSelection();
    void handleProjectSelection(uint32_t projectId, const String &projectName);
    void handleFormsRequest(const API::ResourceUsageFormRequest &request);
    void handleFormFields(const API::ResourceUsageFormFieldsPage &page);
    void handleFormPageResult(const API::ResourceUsageFormPageResult &result);
    void handleFormPageNext(const API::FormPageSubmission &page);
    void handleFormPageBack();
    void handleFormsCancel();
    void requestCurrentFormField();
    void advanceFormCursor();
    void retreatFormCursor();
    void finishFormFlow();
    uint32_t totalFormFields() const;
    uint32_t globalFormFieldNumber() const;
    bool isLastFormField() const;
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