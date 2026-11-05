#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <cstddef>
#include "../display/ui/ui_step.hpp"

#include "api_types.hpp"

#include <functional>
#include <atomic>
#include <mutex>
#include <ArduinoJson.h>
#include "mass_introduction_types.hpp"
#include "ui_state.hpp"

struct ApiState : public ApiCards, public ApiMassIntroduction, public ApiUiState
{
protected:
    bool loopIsEnabled = false;
    unsigned long heartbeat_sent_at = 0;
    std::function<void(const ResourceList &)> resourceListUpdateCallback;
    std::function<void(CardAuthenticationDetailsResponse)> cardAuthenticationDetailsResponseCallback;
    std::function<void(SupervisionStartCommand)> supervisionStartCallback;
    std::function<void(SupervisionRequestResult)> supervisionRequestResultCallback;
    std::function<void(SupervisorCardAuthenticationResponse)> supervisorCardAuthenticationResponseCallback;
    std::function<void(SupervisionResolvedResult)> supervisionResolvedCallback;
    std::function<void(const MassIntroductionStartCommand &)> massIntroductionStartCallback;
    std::function<void(const MassIntroductionCardAuthenticationResponse &)> massIntroductionCardAuthenticationCallback;
    std::function<void(const MassIntroductionResult &)> massIntroductionResultCallback;
    std::function<void(const MassIntroductionEnd &)> massIntroductionEndCallback;
    std::function<void(std::string)> deviceNameCallback;
    std::function<void(uint8_t)> ledBrightnessChangedCallback;
    // Written by the LVGL task's page requests, read when responses arrive.
    // Recursive: the response callback may issue the next request.
    std::recursive_mutex lastRequestedProjectsOfUserMutex;
    uint32_t lastRequestedProjectsOfUserPage = -1;
    uint32_t lastRequestedProjectsOfUserId = 0;
    std::string lastRequestedProjectsOfUserSearch;
    std::function<void(const ProjectsOfUserResponse &)> projectsOfUserResponseCallback;
    static constexpr size_t JSON_INBUF = 4608;
    static constexpr size_t JSON_OUTBUF_SMALL = 256;
    static constexpr size_t JSON_OUTBUF_AUTH = 1024;
    uint32_t resourceListMessageCounter = 0;
    uint32_t resourceListRevision = 0;
    uint32_t nextRequestId = 0;
    std::atomic<uint32_t> usageStatsRequestId{0};
    std::function<void(const UsageStats &)> usageStatsCallback;
    std::atomic<uint32_t> activeActionRequestId{0};
    ResourceList resourceListScratch;
    StaticJsonDocument<6144> inboundDoc;
    ProjectsOfUserResponse projectsOfUserResponseScratch;
    ResourceUsageFormRequest resourceFormsRequestScratch;
    ResourceUsageFormFieldsPage resourceFormFieldsScratch;
    ResourceUsageFormPageResult resourceFormPageResultScratch;
    std::function<void(const ResourceUsageFormRequest &)> resourceFormsRequestCallback;
    std::function<void(const ResourceUsageFormFieldsPage &)> resourceFormFieldsCallback;
    std::function<void(const ResourceUsageFormPageResult &)> resourceFormPageResultCallback;
    bool crashReportAwaitingAck = false;
    bool crashReportSentCoredump = false;
    std::function<void(std::string username)> enrollNewCardGetAvailableKeyNoCallback;
    std::function<void(uint8_t keyNo, std::string key)> enrollNewCardCallback;
    std::function<void(std::string error)> enrollNewCardErrorCallback;
    std::function<void(std::string username, uint8_t keyNo, std::string key)> resetNfcCardCallback;
    // (event type that carried the error, error code); OTA reports its own labels.
    std::function<void(const char *eventType, const char *code)> errorCallback;
    std::function<void(const ActionResult &)> actionResultCallback;
    std::function<void(bool)> insufficientBalanceCallback;
    std::function<void(int)> firmwareUpdateProgressCallback;
    std::function<bool(std::string availableVersion)> firmwareUpdateMetaCallback;
};

#include "../settings/settings.hpp"
#include "../state/state.hpp"
#include "../logger/logger.hpp"
#include "reader_transport.hpp"
#include "../utils.hpp"
#ifdef ATTRACTAP_HOST
class HostOtaUpdater
{
public:
    template <typename... Args>
    explicit HostOtaUpdater(Args &&...) {}
    void tick() {}
    bool inProgress() const { return false; }
};
#else
#include "ota/ota_updater.hpp"
#endif

class API : public ApiState
{
public:
    explicit API(IReaderTransport &transport);

    void setup();
    void loop();
    void processIncomingMessage(const char *buf, size_t len);

    void setResourceListUpdateCallback(std::function<void(const ResourceList &)> callback);
    uint32_t requestResourceList();

    void requestUsageStats(uint32_t resourceId);
    void setUsageStatsCallback(std::function<void(const UsageStats &)> callback);

    void cancelResourceAction() { activeActionRequestId = 0; }
    bool isCurrentResourceAction(uint32_t requestId) const { return !requestId || requestId == activeActionRequestId.load(); }

    void requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength, uint32_t resourceId);

    void setCardAuthenticationDetailsResponseCallback(std::function<void(CardAuthenticationDetailsResponse)> callback);

    // --- Two-card supervision (ATT-493) -------------------------------------------------------
    // After a non-introduced user authenticates, the reader asks the server to open a supervision
    // request. The request is broadcast to eligible supervisors over the web (SSE) while the reader
    // simultaneously waits for one of them to tap their card. Either channel resolves the request.

    // Server-pushed arming (ATT-816): the requester started in the web UI and picked this reader,
    // so there is no first card tap. The reader waits for a supervisor card exactly as usual, but
    // must not start the session itself — it confirms the card auth and the server does the rest.

    void requestSupervision(uint32_t resourceId);
    void requestSupervisorCardAuthenticationData(uint8_t *uid, uint8_t uidLength, uint32_t resourceId);
    void confirmSupervisorCardAuth(uint32_t resourceId);
    void cancelSupervision();
    void setSupervisionStartCallback(std::function<void(SupervisionStartCommand)> callback);
    void setSupervisionRequestResultCallback(std::function<void(SupervisionRequestResult)> callback);
    void setSupervisorCardAuthenticationResponseCallback(std::function<void(SupervisorCardAuthenticationResponse)> callback);
    void setSupervisionResolvedCallback(std::function<void(SupervisionResolvedResult)> callback);

    // --- Mass introduction (ATT-1151) ----------------------------------------------------------
    // Server-armed like ATT-816 supervision. Every message carries the sessionId so the flow can
    // ignore replies for a session it has already left.
    void requestMassIntroductionCardAuthenticationData(const char *sessionId, const uint8_t *uid, uint8_t uidLength);
    void confirmMassIntroductionCardAuth(const char *sessionId, const uint8_t *uid, uint8_t uidLength);
    void cancelMassIntroduction(const char *sessionId);
    void setMassIntroductionStartCallback(std::function<void(const MassIntroductionStartCommand &)> callback);
    void setMassIntroductionCardAuthenticationCallback(std::function<void(const MassIntroductionCardAuthenticationResponse &)> callback);
    void setMassIntroductionResultCallback(std::function<void(const MassIntroductionResult &)> callback);
    void setMassIntroductionEndCallback(std::function<void(const MassIntroductionEnd &)> callback);

    void setEnrollNewCardGetAvailableKeyNoCallback(std::function<void(std::string username)> callback);
    void setEnrollNewCardCallback(std::function<void(uint8_t keyNo, std::string key)> callback);
    void setEnrollNewCardErrorCallback(std::function<void(std::string error)> callback);

    void sendEnrollNewCardAvailableKeyNo(uint8_t *uid, uint8_t uidLength, uint8_t keyNo);
    void sendEnrollNewCard(bool success);
    void sendEnrollNewCardCancel();

    // Card reset/deletion. The server already knows the card's stored key + slot
    // (it is being deleted from the DB), so it hands them to the reader in a
    // single RESET_NFC_CARD event — no key round-trip like enrollment.
    void setResetNfcCardCallback(std::function<void(std::string username, uint8_t keyNo, std::string key)> callback);
    void sendResetNfcCard(bool success);
    void sendResetNfcCardCancel();

    // `stepId`/`choice` answer a plugin confirmation (UI_STEP_REQUEST); the server matches them to the step.
    void startResourceUsageSession(uint32_t resourceId, uint32_t projectId = 0, bool forceTakeOver = false,
                                   const char *stepId = nullptr, const char *choice = nullptr);

    // Reader UI (ATT-1187)
    void setUiStepRequestCallback(std::function<void(const ui::StepRequest &)> callback) { uiStepRequestCallback = callback; }
    void setUiStepCancelCallback(std::function<void(const std::string &)> callback) { uiStepCancelCallback = callback; }
    void setUiSlotsChangedCallback(std::function<void()> callback) { uiSlotsChangedCallback = callback; }
    void sendUiStepResult(const char *stepId, const char *action);
    void reportUiSkip(JsonObjectConst payload, const char *reason); // UI_SLOT_UPDATE contribution skipped, paced
    void clearUiSlots(); // drops all plugin slot content (disconnect, reconnect)
    void endCardSession(); // tells the server the card session is over (sign-out or timeout)
#ifdef ATTRACTAP_UI_SELFTEST
    void testInject(const char *json, size_t len); // self-test build: processed by API::loop()
#endif
    // usageId 0 ends the card holder's own session; otherwise force-stops that session.
    void stopResourceUsageSession(uint32_t resourceId, uint32_t usageId = 0);
    void requestFormFields(uint32_t resourceId, ResourceUsageFormActionType action, uint32_t formId, uint32_t offset, uint32_t limit);
    void submitFormPage(uint32_t resourceId, ResourceUsageFormActionType action, const FormPageSubmission &page);
    void cancelForm(uint32_t resourceId, ResourceUsageFormActionType action);
    void lockDoor(uint32_t resourceId);
    void unlockDoor(uint32_t resourceId);
    void unlatchDoor(uint32_t resourceId);
    void triggerFlowButton(uint32_t resourceId, const char *buttonId);

    void requestBillingTopup(uint32_t amountCents);

    void onDeviceName(std::function<void(std::string)> callback);
    uint32_t authenticationGeneration() const { return authenticationCount; }
    void setLedBrightnessChangedCallback(std::function<void(uint8_t)> callback);

    void disableConnectionAttempts();
    void enableConnectionAttempts();

    // Clear the locked TLS certificate decision (device settings button).
    void resetCertificateTrust();

    // Error callback for server responses carrying an error field.
    // For server errors, message is the raw code; the application localizes it.
    void setErrorCallback(std::function<void(const char *eventType, const char *code)> callback);
    // Generic action result callback for async operations (start/stop sessions, door controls, flow buttons)
    void setActionResultCallback(std::function<void(const ActionResult &)> callback);

    // Special-case callback for insufficient balance with server-provided SumUp flag
    void setInsufficientBalanceCallback(std::function<void(bool sumUpEnabled)> callback);

    bool requestProjectsOfUser(uint32_t page, const std::string &search = "");
    void setProjectsOfUserResponseCallback(std::function<void(const ProjectsOfUserResponse &)> callback);
    void setResourceFormsRequestCallback(std::function<void(const ResourceUsageFormRequest &)> callback);
    void setResourceFormFieldsCallback(std::function<void(const ResourceUsageFormFieldsPage &)> callback);
    void setResourceFormPageResultCallback(std::function<void(const ResourceUsageFormPageResult &)> callback);
    // Get references to the form scratch buffers for deferred copy
    const ResourceUsageFormRequest &getFormRequestScratch() const { return resourceFormsRequestScratch; }
    const ResourceUsageFormFieldsPage &getFormFieldsScratch() const { return resourceFormFieldsScratch; }
    const ResourceUsageFormPageResult &getFormPageResultScratch() const { return resourceFormPageResultScratch; }

private:
    Logger logger;
    IReaderTransport &transport;

    void dispatchIncomingEvent(const char *eventType, uint32_t requestId);
    void updateSateInfo();

    bool isRegistered();

    void onSupervisionStart(JsonObject data);

    void onSupervisionRequestResult(JsonObject data);
    void onSupervisorCardAuthenticationData(JsonObject data);
    void onSupervisionResolved(JsonObject data);

    void onMassIntroductionStart(JsonObject data);
    void onMassIntroductionCardAuthenticationData(JsonObject data);
    void onMassIntroductionResult(JsonObject data);
    void onMassIntroductionEnd(JsonObject data);

    uint32_t authenticationCount = 0;

    void sendAck(const char *type, uint32_t messageId = 0, bool paced = true); // UI_* acks are paced (ApiUiState)
    void sendUiRenderReport(const UiRenderReport &report);
    void sendMessage(const char *type);
    bool sendMessage(const char *type, JsonObject payload, uint32_t messageId = 0);
    void readBlockReason(JsonVariantConst reason, ActionResult &out);
    void onUiSlotUpdate(JsonObject data);
    void onUiStepRequest(JsonObject data);
    void onUiStepCancel(JsonObject data);

    void onUsageStats(JsonObject data);

    void sendResourceAction(const char *type, JsonObject payload);

    void sendHeartbeat();

    void onUnauthorized(JsonObject data);
    void onStartPairing(JsonObject data);
    void sendAuthenticationRequest();
    void onReaderAuthenticated(JsonObject data);
    void onServerTime(JsonVariantConst serverTime);
    void sendFirmwareInfo();

    // Persisted crash/boot diagnostics upload (ATT-474). On a successful
    // connect the stored NVS record + (if present) the coredump blob are
    // pushed to the server; both are cleared once the server confirms receipt.
    void sendPendingCrashReport();
    void onCrashReportResponse(JsonObject data);

    void onResourceList(JsonObject data);
    void onProjectsOfUserResponse(JsonObject data);
    void onCardAuthenticationDetailsResponse(JsonObject data);
    void onResourceUsageFormRequest(JsonObject data);
    void onResourceUsageFormFields(JsonObject data);
    void onResourceUsageFormPageResult(JsonObject data);
    ResourceUsageFormActionType parseFormAction(const char *action);

    static const char *formActionToString(ResourceUsageFormActionType action);
    ResourceUsageFormFieldType parseFormFieldType(const char *type);
    void parseFormFieldOptions(ResourceUsageFormField &field, JsonVariantConst options);
    void resetResourceUsageFormField(ResourceUsageFormField &field);
    void serializeFormPageSubmission(JsonObject payload, const FormPageSubmission &page);

    void onEnrollNewCardGetAvailableKeyNo(JsonObject data);
    void onEnrollNewCard(JsonObject data);
    // Server reuses the ENROLL_NEW_CARD_REQUEST_NFC_KEY event to report errors
    // back to the reader (e.g. CARD_ALREADY_ENROLLED).
    void onEnrollNewCardRequestNFCKeyError(JsonObject data);

    void onResetNfcCard(JsonObject data);

    // Firmware update progress callback with status enum
public:
    void setFirmwareUpdateProgressCallback(std::function<void(int)> callback);
    // Return false to abort preparation before erasing flash (e.g. RF shutdown failed).
    void setFirmwareUpdateMetaCallback(std::function<bool(std::string availableVersion)> callback);

private:

#ifdef ATTRACTAP_HOST
    HostOtaUpdater firmware;
#else
    OtaUpdater firmware;
#endif
};
