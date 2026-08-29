#pragma once

#include <string>
#include "settings/kvstore.hpp"

#ifdef DEMO_MODE
#include "../demo/demo_store.hpp"
#endif

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
#include "supervision.hpp"
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
#ifdef HAS_LVGL_DISPLAY
                    bootDone(false),
#endif
                    unlocked(false)
#ifdef HAS_LVGL_DISPLAY
                    ,
                    resourceCount(0),
                    resourceIsSelected(false),
                    selectedResourceChanged(false),
                    resourceListUpdated(false)
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

#ifdef HAS_LVGL_DISPLAY
    SupervisionFlow supervision{api, nfc, beeper, logger, Display::supervisionScreen};
#endif

#ifdef HAS_WS2812_LED
    LedController led;
    void updateLedState();
#endif

    enum ExternalStates_t
    {
        EXTERNAL_STATE_NONE,
#ifdef HAS_LVGL_DISPLAY
        EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
        EXTERNAL_STATE_RESET_NFC_CARD,
#endif
        EXTERNAL_STATE_AUTHENTICATE_CARD,
        EXTERNAL_STATE_FIRMWARE_UPDATE,
    };

    ExternalStates_t externalState;

#ifdef HAS_LVGL_DISPLAY
    struct ApiEnrollNewCardGetAvailableKeyNoData_t
    {
        std::string username;
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
    // Set by the card-detection callback when a card enters the field during
    // ENROLL_PHASE_WAIT_FOR_CARD. The enrollment state machine consumes it on
    // the main loop. Lets WAIT_FOR_CARD ride the proven handleCardDetection
    // loop (reliable re-arm across removals) instead of blind PN532 polling.
    volatile bool enrollCardDetected = false;
    volatile bool enrollKeyMaterialReady = false;
    volatile bool enrollCancelRequested = false;
    volatile bool enrollErrorPending = false;
    // Fixed buffer, not an Arduino std::string: the producer runs on the websocket
    // task and the consumer on the main loop. A std::string would reallocate its
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

    // Card reset/deletion. Mirrors the sticky, poll-driven enrollment sub-flow:
    // once started it owns the display until success, cancel or timeout. Unlike
    // enrollment there is no key round-trip — the server hands over the stored
    // key + slot up front, so the reader can authenticate the card and write the
    // factory key back as soon as a card is presented.
    struct ApiResetNfcCardData_t
    {
        std::string username;
        uint8_t keyNo;
        uint8_t keyBytes[16];
    };
    ApiResetNfcCardData_t apiResetNfcCardData;

    enum ResetPhase_t
    {
        RESET_PHASE_NONE,
        RESET_PHASE_WAIT_FOR_CARD, // screen up, waiting for a card to reset
        RESET_PHASE_WRITING,       // authenticating + writing the factory key back
        RESET_PHASE_SUCCESS,       // success shown, dwelling before exit
        RESET_PHASE_ERROR,         // error shown, dwelling before retry
    };
    ResetPhase_t resetPhase = RESET_PHASE_NONE;
    // Set by the card-detection callback when a card enters the field during
    // RESET_PHASE_WAIT_FOR_CARD; consumed on the main loop. Rides the proven
    // handleCardDetection loop for reliable re-arm across removals (like ATT-503).
    volatile bool resetCardDetected = false;
    volatile bool resetCancelRequested = false;
    uint32_t resetStartTimeMs = 0;
    uint32_t resetPhaseChangedMs = 0;
    static constexpr uint32_t RESET_TIMEOUT_MS = 30000;
    static constexpr uint32_t RESET_SUCCESS_DWELL_MS = 1500;
    static constexpr uint32_t RESET_ERROR_DWELL_MS = 1800;
    void beginReset();
    void processReset();
    void exitReset();

#endif

#ifdef DEMO_MODE
    // Demo-mode card scan for the settings screen (register card → role)
    volatile bool demoPendingScanActive = false;
    volatile bool demoPendingScanReady = false;
    std::string demoScanUid;
#endif

    API::CardAuthenticationDetailsResponse cardAuthenticationData;

    int firmwareUpdateProgressPct;

    std::string availableFirmwareVersion;

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

    KVStore bootDiagPreferences;
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
    std::string selectedProjectName;
    uint32_t projectsCurrentPage = 1;
    uint32_t projectsTotalCount = 0;
    bool projectsHasMore = false;
    std::string currentProjectsUser;

    enum pending_action_t
    {
        PENDING_ACTION_NONE,
        PENDING_ACTION_START_SESSION,
        PENDING_ACTION_STOP_SESSION,
    };
    pending_action_t pendingActionType = PENDING_ACTION_NONE;
    uint32_t pendingActionResourceId = 0;
    uint32_t pendingActionProjectId = 0;
    bool pendingActionIsTakeover = false;
    bool hasPendingFormRequest = false;
    // True once the form for the in-flight action has been fully submitted and the
    // START/STOP message sent. Guards against a re-delivered (retried by the server)
    // RESOURCE_USAGE_FORM_REQUEST reopening the form from the beginning (ATT-545).
    bool formFlowSubmitted = false;
    // Flags set by websocket callbacks when form events arrive; processed by LVGL thread
    volatile bool pendingFormRequestReady = false;
    // Preserved before deferred LVGL activation so cancellation can clear the server draft.
    bool hasPendingServerFormFlow = false;
    uint32_t pendingFormRequestResourceId = 0;
    API::ResourceUsageFormActionType pendingFormRequestAction =
        API::ResourceUsageFormActionType::UNKNOWN;
    volatile bool pendingFormFieldsReady = false;
    volatile bool pendingFormPageResultReady = false;
    API::ResourceUsageFormRequest pendingFormRequest;
    API::ResourceUsageFormFieldsPage pendingFormFields;
    API::ResourceUsageFormPageResult pendingFormPageResult;
    uint8_t formCursorFormIdx = 0;
    uint32_t formCursorOffset = 0;

    // Prefetch cache for paginated form fields. Each navigation otherwise costs a
    // full server round-trip; we cache visited pages and preload the next one so
    // forward/back navigation renders instantly. Keyed by (formId, offset).
    struct FormPageCacheEntry {
      bool valid = false;
      uint32_t formId = 0;
      uint32_t offset = 0;
      uint32_t lru = 0;
      API::ResourceUsageFormFieldsPage page;
    };
    static constexpr uint8_t FORM_PAGE_CACHE_SIZE = 4;
    FormPageCacheEntry formPageCache[FORM_PAGE_CACHE_SIZE];
    uint32_t formCacheTick = 0;
    // True while a GET for the field the user is currently waiting on is in flight.
    bool awaitingFieldRender = false;

    FormPageCacheEntry *findFormPageCache(uint32_t formId, uint32_t offset);
    FormPageCacheEntry *storeFormPageCache(const API::ResourceUsageFormFieldsPage &page);
    void invalidateFormPageCache(uint32_t formId, uint32_t offset);
    void clearFormPageCache();
    void renderFormFieldPage(const API::ResourceUsageFormFieldsPage &page);
    bool computeNextFormCursor(uint8_t &formIdx, uint32_t &offset) const;
    void prefetchNextFormField();

    void selectResource(const API::ResourceBrief &resource);

    void requestProjectsPage(uint32_t page);
    void clearProjectSelection();
    void handleProjectSelection(uint32_t projectId, const std::string &projectName);
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
    void onActionResult(const std::string &eventType);
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
        APPLICATION_STATE_RESET,
        APPLICATION_STATE_SUPERVISION,
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
