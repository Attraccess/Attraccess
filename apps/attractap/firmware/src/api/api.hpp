#pragma once

#include "payloads.hpp"

#include <functional>
#include <atomic>
#include <ArduinoJson.h>

#ifdef ARDUINOJSON_VERSION_MAJOR
#include <cstdlib>
#include <algorithm>
#include <cstring>
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

// ArduinoJson 7's StaticJsonDocument capacity is only a compatibility hint.
// Account for every allocation (including our aligned size header) instead.
class ReaderJsonAllocator final : public ArduinoJson::Allocator
{
    struct alignas(std::max_align_t) Header { size_t bytes; };
    size_t used = 0;
    size_t peak = 0;
public:
    static constexpr size_t LIMIT = 32768;
    void beginMessage() { peak = used; }
    size_t peakBytes() const { return peak; }
    size_t usedBytes() const { return used; }
    void *allocate(size_t size) override { return reallocate(nullptr, size); }
    void deallocate(void *pointer) override
    {
        if (!pointer) return;
        auto *header = static_cast<Header *>(pointer) - 1;
        used -= header->bytes;
        // Clear transient parsed strings before releasing internal RAM.
        volatile unsigned char *bytes = reinterpret_cast<unsigned char *>(header);
        const size_t count = header->bytes;
        for (size_t i = 0; i < count; ++i) bytes[i] = 0;
        std::free(header);
    }
    void *reallocate(void *pointer, size_t size) override
    {
        if (!size) { deallocate(pointer); return nullptr; }
        auto *old = pointer ? static_cast<Header *>(pointer) - 1 : nullptr;
        const size_t previous = old ? old->bytes : 0;
        if (size > LIMIT - sizeof(Header) || size + sizeof(Header) > LIMIT - used)
            return nullptr;
        const size_t total = size + sizeof(Header);
#ifdef ESP_PLATFORM
        auto *next = static_cast<Header *>(heap_caps_malloc(total, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
#else
        auto *next = static_cast<Header *>(std::malloc(total));
#endif
        if (!next) return nullptr;
        next->bytes = total;
        used += total;
        peak = std::max(peak, used);
        // The old allocation remains counted until its replacement is copied
        // and wiped. A failed allocation leaves the old data intact.
        if (old) {
            std::memcpy(next + 1, pointer, std::min(size, previous - sizeof(Header)));
            deallocate(pointer);
        }
        return next + 1;
    }
};
#endif

struct ApiState : public ApiCards
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
    std::function<void(std::string)> deviceNameCallback;
    std::function<void(uint8_t)> ledBrightnessChangedCallback;
    uint32_t lastRequestedProjectsOfUserPage = -1;
    std::function<void(const ProjectsOfUserResponse &)> projectsOfUserResponseCallback;
    static constexpr size_t JSON_INBUF = 8192;
    static constexpr size_t JSON_OUTBUF_SMALL = 256;
    static constexpr size_t JSON_OUTBUF_AUTH = 1024;
    uint32_t resourceListMessageCounter = 0;
    uint32_t resourceListRevision = 0;
    uint32_t nextRequestId = 0;
    std::atomic<uint32_t> usageStatsRequestId{0};
    std::function<void(const UsageStats &)> usageStatsCallback;
    std::atomic<uint32_t> activeActionRequestId{0};
    ResourceList resourceListScratch;
#ifdef ARDUINOJSON_VERSION_MAJOR
    ReaderJsonAllocator inboundAllocator;
    JsonDocument inboundDoc{&inboundAllocator};
#else
    // Declaration-only screen harnesses do not instantiate or parse JSON.
    StaticJsonDocument<32768> inboundDoc;
#endif
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
    std::function<void(const char *title, const char *message)> errorCallback;
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

    void startResourceUsageSession(uint32_t resourceId, uint32_t projectId = 0, bool forceTakeOver = false);
    void stopResourceUsageSession(uint32_t resourceId);
    void requestFormFields(uint32_t resourceId, ResourceUsageFormActionType action, uint32_t formId, uint32_t offset, uint32_t limit);
    void submitFormPage(uint32_t resourceId, ResourceUsageFormActionType action, const FormPageSubmission &page);
    void cancelForm(uint32_t resourceId, ResourceUsageFormActionType action);
    void lockDoor(uint32_t resourceId);
    void unlockDoor(uint32_t resourceId);
    void unlatchDoor(uint32_t resourceId);
    void triggerFlowButton(uint32_t resourceId, const char *buttonId);

    void requestBillingTopup(uint32_t amountCents);

    void onDeviceName(std::function<void(std::string)> callback);
    void setLedBrightnessChangedCallback(std::function<void(uint8_t)> callback);

    void disableConnectionAttempts();
    void enableConnectionAttempts();

    // Clear the locked TLS certificate decision (device settings button).
    void resetCertificateTrust();

    // Error callback for server responses carrying an error field.
    // For server errors, message is the raw code; the application localizes it.
    void setErrorCallback(std::function<void(const char *title, const char *message)> callback);
    // Generic action result callback for async operations (start/stop sessions, door controls, flow buttons)
    void setActionResultCallback(std::function<void(const ActionResult &)> callback);

    // Special-case callback for insufficient balance with server-provided SumUp flag
    void setInsufficientBalanceCallback(std::function<void(bool sumUpEnabled)> callback);

    void requestProjectsOfUser(uint32_t page);
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

    void sendAck(const char *type);
    void sendMessage(const char *type);
    bool sendMessage(const char *type, JsonObject payload);

    void onUsageStats(JsonObject data);

    void sendResourceAction(const char *type, JsonObject payload);

    // Persistent scratch buffer to avoid large stack allocations when parsing resource lists

    // Persistent inbound JSON document to avoid large stack usage in websocket task

    void sendHeartbeat();

    void onRegistrationData(JsonObject data);
    void onUnauthorized(JsonObject data);
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
