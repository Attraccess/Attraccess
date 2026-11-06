#pragma once
#include "state/forms.hpp"

class Application : protected ApplicationFormsState
{
public:
    Application(INfc &nfc, API &api) : nfc(nfc), logger("Application"), api(api) {}

    void setup();
    void loop();

private:
    bool processConfigurationState();
    bool processConnectionState();
    bool processCardFlowState();
    bool processAuthenticationState();
    void renderResourceState();
    void setupApiCallbacks();
    void setupErrorCallbacks();
    void setupActionCallbacks();
    void setupUiCallbacks();
    void setupDisplayCallbacks();
    void setupCardCallbacks();
    void setupFormCallbacks();
    void setupNfcCallbacks();
#ifdef HAS_IO_EXPANDER
    IOExpander ioExpander;
#endif
    INfc &nfc;
    Logger logger;
    API &api;
    bool firmwareUpdateActive = false;
    Beeper beeper;

    // Runs card commands for the server (the reader holds no card keys or session).
    CardRelay cardRelay{CardRelay::Hooks{
        [this](const uint8_t *apdu, uint8_t length, uint8_t *response, uint8_t *responseLength) {
          return this->nfc.transceive(apdu, length, response, responseLength);
        },
        [this](const char *id, uint32_t seq, const uint8_t *response, uint8_t length) {
          this->api.sendCardApduResponse(id, seq, response, length);
        },
        [this](const char *id) { this->api.sendCardRemoved(id); },
        [this](bool active) { this->nfc.setConversationActive(active); }}};
    // Non-display readers log out after each card action; the server is told shortly afterwards,
    // unless a new tap starts first (that tap replaces the verified user anyway).
    uint32_t sessionEndNotifyAtMs = 0;

#ifdef HAS_LVGL_DISPLAY
    SupervisionFlow supervision{api, nfc, beeper, logger, Display::supervisionScreen};
    MassIntroductionFlow massIntroduction{api, nfc, beeper, logger, Display::massIntroductionScreen};
#endif

#ifdef HAS_WS2812_LED
    LedController led;
    void updateLedState();
#endif

#ifdef HAS_LVGL_DISPLAY

    void beginEnrollment();
    void processEnrollment();
    void exitEnrollment();

    void beginReset();
    void processReset();
    void exitReset();

#endif

#ifdef DEMO_MODE
    // Demo-mode card scan for the settings screen (register card → role)
#endif

    static void
    networkTask(void *parameter);

#ifdef HAS_WS2812_LED
    static void ledTask(void *parameter);
#endif

    void processState();

    void setupBootDiagnostics();
    void snapshotBootDiagnostics();

#ifdef HAS_LVGL_DISPLAY
    void handleConnectionConfigurationSave(const ConnectionConfigurationScreen::ConnectionConfig &cfg);

    void handleTouch(int16_t x, int16_t y);

#endif
#ifdef HAS_LVGL_DISPLAY

    void restartSessionTimeout();
    void resetPauseAccounting();
    void resetSessionOnDisconnect();

    void restartResourceSelectionTimeout();

    void handleResourceListAction(const API::ResourceBrief &resource, ResourceListAction action);
    void updateSelectedResourceDetails();
    void showReaderActionProgress(const FirmwareI18n::Text &title);
    void finishReaderAction(bool success);
    void logoutReader();
    void beginSessionSummary(const API::ActionResult &result);
    void dismissSessionSummary();
    // Full-screen result over the current screen. `resumeRouting`: leaving it lets the application
    // route from its state (e.g. to the lockscreen after a logout) instead of returning to the origin.
    void showStatus(StatusScreen::Config config, bool resumeRouting = false);
    std::string resourceNameOf(uint32_t resourceId) const;
    // An action failed: in place on the button that started it, or a full-screen error when that is gone.
    void showActionFailure(uint32_t resourceId, const std::string &errorCode,
                           const FirmwareI18n::Text &preferred = FirmwareI18n::Text(), bool returnToList = false);
    // "Sign-in failed" with `message`; a card tapped meanwhile dismisses it (dismissSignedOutStatus).
    void showSignInFailed(const FirmwareI18n::Text &message);
    // A refused action: top-up, "insufficient balance" or showActionFailure.
    void reportActionFailure(const API::ActionResult &result, uint32_t resourceId, bool returnToList);
    // The server refused a usage form request (its fields or a page).
    void handleFormFlowError(const API::ActionResult &result);
    RoutingKey routingKey() const;
    // A card tapped while "sign-in failed" or "status unavailable" is up: back to the signed-out
    // screen the state dictates, so the tap signs in as usual.
    bool dismissSignedOutStatus();
    // An error the server reported for `eventType`; only errors that belong to something on screen get UI.
    void handleReaderError(const std::string &eventType, const std::string &code);
    // Top-up is a routed screen over the origin; the form and project screens likewise.
    // `keepAmount`: a refused request comes back with the amount that was typed.
    void openTopUp(bool keepAmount = false);
    void leaveTopUp();
    void leaveForms();
    void openProjects();
    void finishCardAuthentication(bool success);

#else
#endif


#ifdef HAS_LVGL_DISPLAY
    // Own a persistent copy of the latest resource list to avoid dangling references

    FormPageCacheEntry *findFormPageCache(uint32_t formId, uint32_t offset);
    FormPageCacheEntry *storeFormPageCache(const API::ResourceUsageFormFieldsPage &page);
    void invalidateFormPageCache(uint32_t formId, uint32_t offset);
    void clearFormPageCache();
    void renderFormFieldPage(const API::ResourceUsageFormFieldsPage &page);
    bool computeNextFormCursor(uint8_t &formIdx, uint32_t &offset) const;
    void prefetchNextFormField();

    void selectResource(const API::ResourceBrief &resource);

    bool requestProjectsPage(uint32_t page, const std::string &search);
    void clearProjectSelection();
    void clearSelectedProject();
    void handleProjectSelection(uint32_t projectId, const std::string &projectName);
    void handleFormsRequest(const API::ResourceUsageFormRequest &request);
    void handleFormFields(const API::ResourceUsageFormFieldsPage &page);
    void handleFormPageResult(const API::ResourceUsageFormPageResult &result);
    void handleFormPageNext(const API::FormPageSubmission &page);
    void handleFormPageBack();
    void handleFormsCancel();
    void pollUsageStats();
    void requestCurrentFormField();
    void advanceFormCursor();
    void retreatFormCursor();
    void finishFormFlow();
    uint32_t totalFormFields() const;
    uint32_t globalFormFieldNumber() const;
    bool isLastFormField() const;
    void onActionResult(const std::string &eventType);

    // Plugin steps (ATT-1187), application_steps.cpp
    void handleUiStepRequest(const ui::StepRequest &step);
    void rejectUiStep(const ui::StepRequest &step);
    void handleUiStepAction(const std::string &stepId, const std::string &action, bool isChoice);
    void handleUiStepCancel(const std::string &stepId);
    void closeUiStep();
    void tickUiStep();
    void clearPendingStartLocally();
#endif
#if defined(HAS_WS2812_LED) && !defined(HAS_LVGL_DISPLAY)
    void handleLiteStepRequest(const ui::StepRequest &step);
    void closeLiteStep();
    void showLiteBlocked(const API::ActionResult &result);
#endif

#ifdef HAS_LVGL_DISPLAY
#else
#endif

#ifdef HAS_LVGL_DISPLAY
    void handleResourceListUpdate(const API::ResourceList &resourceList);
#endif
    void processCardAuthenticationData();

#ifdef HAS_LVGL_DISPLAY
    void handleResourceDetailsButtonClick(ResourceDetailsScreen::ButtonClickEventData evt);

    // Action pause tracking (while server actions are running)
    void beginActionPause();
    void endActionPause();

#endif
};
