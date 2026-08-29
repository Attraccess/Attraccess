#pragma once

#include <functional>

#include <ArduinoJson.h>
#include <string>
#include <vector>
#include "../settings/settings.hpp"
#include "state/state.hpp"
#include "../logger/logger.hpp"
#ifdef DEMO_MODE
#include "demo_websocket.hpp"
#else
#include "../websocket/websocket.hpp"
#endif
#include "../utils.hpp"
#include "ota/ota_updater.hpp"

class API
{
public:
    API() : logger("API"),
            firmware(
                logger,
                [this](const char *type, JsonObject payload)
                { return this->sendMessage(type, payload); },
                [this](const char *reason)
                { this->websocket.forceReconnect(reason); },
                firmwareUpdateProgressCallback,
                firmwareUpdateMetaCallback,
                errorCallback) {}

    void setup();
    void loop();
    void processIncomingMessage(const char *buf, size_t len);
    static constexpr size_t MAX_RESOURCES = 10;
    static constexpr size_t MAX_RESOURCE_NAME_LEN = 64;
    static constexpr size_t MAX_DESC_LEN = 128;
    static constexpr size_t MAX_USERNAME_LEN = 32;
    static constexpr size_t MAX_HEALTH_REASON_LEN = 160;
    static constexpr size_t MAX_INTRODUCERS = 8;
    static constexpr size_t MAX_FLOW_BUTTONS = 7;
    static constexpr size_t MAX_FLOW_BUTTON_LABEL_LEN = 32;
    static constexpr size_t MAX_FLOW_BUTTON_ID_LEN = 48;
    static constexpr size_t MAX_PROJECTS_PER_PAGE = 4;
    static constexpr size_t MAX_FORMS_PER_REQUEST = 4;
    static constexpr size_t MAX_FORM_PAGE_FIELDS = 1;
    static constexpr size_t MAX_FORM_PAGE_ERRORS = MAX_FORM_PAGE_FIELDS;
    static constexpr size_t MAX_SELECT_OPTIONS = 12;
    struct FlowButton
    {
        char id[MAX_FLOW_BUTTON_ID_LEN];
        char label[MAX_FLOW_BUTTON_LABEL_LEN];
    };
    struct ResourceBrief
    {
        uint32_t id;
        uint8_t type; // 0: machine, 1: door (encode from API strings)
        bool separateUnlockAndUnlatch;
        bool allowTakeOver;
        char name[MAX_RESOURCE_NAME_LEN];
        char description[MAX_DESC_LEN];
        bool hasActiveUsage;
        bool isUnderMaintenance;
        bool isHealthy;
        char healthReason[MAX_HEALTH_REASON_LEN];
        char activeUser[MAX_USERNAME_LEN];
        uint32_t activeStartEpoch;          // seconds since epoch (UTC)
        int16_t activeStartUtcOffsetMinutes; // server tz offset (minutes east of UTC) for that instant
        std::vector<std::string> introducers;
        uint8_t flowButtonCount;
        FlowButton flowButtons[MAX_FLOW_BUTTONS];
    };
    struct ResourceList
    {
        uint16_t count;
        ResourceBrief items[MAX_RESOURCES];
    };
    struct Project
    {
        uint32_t id;
        std::string name;
    };
    struct ProjectsOfUserResponse
    {
        uint16_t count;
        uint32_t page = 1;
        uint32_t limit = MAX_PROJECTS_PER_PAGE;
        uint32_t total = 0;
        bool hasMore = false;
        Project items[MAX_PROJECTS_PER_PAGE];
    };

    enum class ResourceUsageFormActionType : uint8_t
    {
        UNKNOWN,
        START,
        END,
        TAKEOVER,
    };

    enum class ResourceUsageFormFieldType : uint8_t
    {
        UNKNOWN,
        TEXT,
        NUMBER,
        BOOLEAN,
        SELECT,
    };

    struct ResourceUsageFormFieldOptions
    {
        struct
        {
            bool hasPlaceholder = false;
            std::string placeholder;
            bool multiline = false;
        } text;
        struct
        {
            bool hasMin = false;
            double min = 0;
            bool hasMax = false;
            double max = 0;
            bool hasStep = false;
            double step = 0;
        } number;
        struct
        {
            uint8_t count = 0;
            std::string values[MAX_SELECT_OPTIONS];
        } select;
    };

    struct ResourceUsageFormField
    {
        uint32_t id = 0;
        ResourceUsageFormFieldType type = ResourceUsageFormFieldType::UNKNOWN;
        bool isRequired = false;
        std::string name;
        std::string description;
        ResourceUsageFormFieldOptions options;
        bool hasValue = false;
        std::string value;
    };

    struct ResourceUsageFormMeta
    {
        uint32_t id = 0;
        std::string name;
        uint32_t fieldCount = 0;
    };

    struct ResourceUsageFormRequest
    {
        uint32_t resourceId = 0;
        ResourceUsageFormActionType action = ResourceUsageFormActionType::UNKNOWN;
        std::string resourceName;
        uint8_t formCount = 0;
        ResourceUsageFormMeta forms[MAX_FORMS_PER_REQUEST];
    };

    struct ResourceUsageFormFieldsPage
    {
        uint32_t resourceId = 0;
        ResourceUsageFormActionType action = ResourceUsageFormActionType::UNKNOWN;
        uint32_t formId = 0;
        uint32_t offset = 0;
        uint32_t totalFieldCount = 0;
        uint8_t fieldCount = 0;
        ResourceUsageFormField fields[MAX_FORM_PAGE_FIELDS];
    };

    struct FormSubmissionAnswer
    {
        uint32_t fieldId = 0;
        enum class ValueType : uint8_t
        {
            STRING,
            NUMBER,
            BOOLEAN,
        } type = ValueType::STRING;
        std::string stringValue;
        double numberValue = 0;
        bool boolValue = false;
    };

    struct FormPageSubmission
    {
        uint32_t formId = 0;
        uint32_t offset = 0;
        uint8_t answerCount = 0;
        FormSubmissionAnswer answers[MAX_FORM_PAGE_FIELDS];
    };

    struct ResourceUsageFormPageResult
    {
        uint32_t resourceId = 0;
        ResourceUsageFormActionType action = ResourceUsageFormActionType::UNKNOWN;
        uint32_t formId = 0;
        uint32_t offset = 0;
        bool valid = false;
        uint8_t errorCount = 0;
        struct Error
        {
            uint32_t fieldId = 0;
            std::string message;
        } errors[MAX_FORM_PAGE_ERRORS];
    };

    void setResourceListUpdateCallback(std::function<void(const ResourceList &)> callback);
    void requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength, uint32_t resourceId);

    struct CardAuthenticationDetailsResponse
    {
        uint8_t keyNo;
        uint8_t keyBytes[16];
        uint8_t keyLen;
        std::string error;
        std::string username;
        bool canManageResource;
        bool hasIntroduction;
        bool isIntroducer;
        // Two-card supervision (ATT-493). supervisionMode is the resource policy; requiresSupervisor
        // is the server's verdict for this user (true => starting a session requires supervisor
        // approval; authentication itself still unlocks the resource details screen).
        std::string supervisionMode;
        bool requiresSupervisor;
    };
    void setCardAuthenticationDetailsResponseCallback(std::function<void(CardAuthenticationDetailsResponse)> callback);

    // --- Two-card supervision (ATT-493) -------------------------------------------------------
    // After a non-introduced user authenticates, the reader asks the server to open a supervision
    // request. The request is broadcast to eligible supervisors over the web (SSE) while the reader
    // simultaneously waits for one of them to tap their card. Either channel resolves the request.
    struct SupervisionRequestResult
    {
        bool success = false;
        std::string error;
        uint32_t timeoutMs = 0;
        uint8_t supervisorCount = 0;
        std::string supervisorNames[MAX_INTRODUCERS];
    };
    struct SupervisorCardAuthenticationResponse
    {
        uint8_t keyNo = 0;
        uint8_t keyBytes[16] = {0};
        uint8_t keyLen = 0;
        std::string error;
        std::string username;
    };
    struct SupervisionResolvedResult
    {
        bool success = false;
        std::string error;
        std::string supervisorUsername;
    };

    // Server-pushed arming (ATT-816): the requester started in the web UI and picked this reader,
    // so there is no first card tap. The reader waits for a supervisor card exactly as usual, but
    // must not start the session itself — it confirms the card auth and the server does the rest.
    struct SupervisionStartCommand
    {
        uint32_t resourceId = 0;
        uint32_t timeoutMs = 0;
        std::string requesterUsername;
    };

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

    // Error callback for server responses carrying an error field
    void setErrorCallback(std::function<void(const char *title, const char *message)> callback);
    // Generic action result callback for async operations (start/stop sessions, door controls, flow buttons)
    void setActionResultCallback(std::function<void(const char *type, bool success)> callback);

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
#ifdef DEMO_MODE
    DemoWebsocket websocket;
#else
    Websocket websocket;
#endif

    void updateSateInfo();

    bool loopIsEnabled = false;

    unsigned long heartbeat_sent_at = 0;
    bool isRegistered();

    std::function<void(const ResourceList &)> resourceListUpdateCallback;
    std::function<void(CardAuthenticationDetailsResponse)> cardAuthenticationDetailsResponseCallback;
    std::function<void(SupervisionStartCommand)> supervisionStartCallback;
    void onSupervisionStart(JsonObject data);
    std::function<void(SupervisionRequestResult)> supervisionRequestResultCallback;
    std::function<void(SupervisorCardAuthenticationResponse)> supervisorCardAuthenticationResponseCallback;
    std::function<void(SupervisionResolvedResult)> supervisionResolvedCallback;
    void onSupervisionRequestResult(JsonObject data);
    void onSupervisorCardAuthenticationData(JsonObject data);
    void onSupervisionResolved(JsonObject data);

    std::function<void(std::string)> deviceNameCallback;
    std::function<void(uint8_t)> ledBrightnessChangedCallback;

    uint32_t lastRequestedProjectsOfUserPage = -1;
    std::function<void(const ProjectsOfUserResponse &)> projectsOfUserResponseCallback;

    void sendAck(const char *type);
    void sendMessage(const char *type);
    bool sendMessage(const char *type, JsonObject payload);
    static constexpr size_t JSON_INBUF = 4608;
    static constexpr size_t JSON_OUTBUF_SMALL = 256;
    static constexpr size_t JSON_OUTBUF_AUTH = 1024;

    uint32_t resourceListMessageCounter = 0;

    // Persistent scratch buffer to avoid large stack allocations when parsing resource lists
    ResourceList resourceListScratch;
    // Persistent inbound JSON document to avoid large stack usage in websocket task
    StaticJsonDocument<6144> inboundDoc;
    void sendHeartbeat();

    ProjectsOfUserResponse projectsOfUserResponseScratch;
    ResourceUsageFormRequest resourceFormsRequestScratch;
    ResourceUsageFormFieldsPage resourceFormFieldsScratch;
    ResourceUsageFormPageResult resourceFormPageResultScratch;
    std::function<void(const ResourceUsageFormRequest &)> resourceFormsRequestCallback;
    std::function<void(const ResourceUsageFormFieldsPage &)> resourceFormFieldsCallback;
    std::function<void(const ResourceUsageFormPageResult &)> resourceFormPageResultCallback;

    void onRegistrationData(JsonObject data);
    void onUnauthorized(JsonObject data);
    void sendAuthenticationRequest();
    void onReaderAuthenticated(JsonObject data);
    void sendFirmwareInfo();

    // Persisted crash/boot diagnostics upload (ATT-474). On a successful
    // connect the stored NVS record + (if present) the coredump blob are
    // pushed to the server; both are cleared once the server confirms receipt.
    void sendPendingCrashReport();
    void onCrashReportResponse(JsonObject data);
    bool crashReportAwaitingAck = false;
    bool crashReportSentCoredump = false;
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

    std::function<void(std::string username)> enrollNewCardGetAvailableKeyNoCallback;
    std::function<void(uint8_t keyNo, std::string key)> enrollNewCardCallback;
    std::function<void(std::string error)> enrollNewCardErrorCallback;

    void onEnrollNewCardGetAvailableKeyNo(JsonObject data);
    void onEnrollNewCard(JsonObject data);
    // Server reuses the ENROLL_NEW_CARD_REQUEST_NFC_KEY event to report errors
    // back to the reader (e.g. CARD_ALREADY_ENROLLED).
    void onEnrollNewCardRequestNFCKeyError(JsonObject data);

    std::function<void(std::string username, uint8_t keyNo, std::string key)> resetNfcCardCallback;
    void onResetNfcCard(JsonObject data);

    std::function<void(const char *title, const char *message)> errorCallback;
    std::function<void(const char *type, bool success)> actionResultCallback;
    std::function<void(bool)> insufficientBalanceCallback;

    // Firmware update progress callback with status enum
public:
    void setFirmwareUpdateProgressCallback(std::function<void(int)> callback);
    void setFirmwareUpdateMetaCallback(std::function<void(std::string availableVersion)> callback);

private:
    std::function<void(int)> firmwareUpdateProgressCallback;
    std::function<void(std::string availableVersion)> firmwareUpdateMetaCallback;

    OtaUpdater firmware;
};
