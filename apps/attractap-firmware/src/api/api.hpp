#pragma once

#include <ArduinoJson.h>
#include "../settings/settings.hpp"
#include "state/state.hpp"
#include "../logger/logger.hpp"
#include "../websocket/websocket.hpp"
#include "../utils.hpp"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_app_format.h"

class API
{
public:
    API() : logger("API") {}

    void setup();
    void loop();
    void processIncomingMessage(const char *buf, size_t len);
    static constexpr size_t MAX_RESOURCES = 10;
    static constexpr size_t MAX_RESOURCE_NAME_LEN = 64;
    static constexpr size_t MAX_DESC_LEN = 128;
    static constexpr size_t MAX_USERNAME_LEN = 32;
    static constexpr size_t MAX_INTRODUCERS = 8;
    static constexpr size_t MAX_FLOW_BUTTONS = 7;
    static constexpr size_t MAX_FLOW_BUTTON_LABEL_LEN = 32;
    static constexpr size_t MAX_FLOW_BUTTON_ID_LEN = 48;
    static constexpr size_t MAX_PROJECTS_PER_PAGE = 4;
    static constexpr size_t MAX_FORMS_PER_REQUEST = 1;
    static constexpr size_t MAX_FORM_FIELDS_PER_FORM = 16;
    static constexpr size_t MAX_FORM_SUBMISSIONS = MAX_FORMS_PER_REQUEST;
    static constexpr size_t MAX_FORM_FIELD_ANSWERS = MAX_FORM_FIELDS_PER_FORM;
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
        char activeUser[MAX_USERNAME_LEN];
        uint32_t activeStartEpoch; // seconds since epoch
        uint8_t introducerCount;
        char introducers[MAX_INTRODUCERS][MAX_USERNAME_LEN];
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
        String name;
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
            String placeholder;
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
            String trueLabel;
            String falseLabel;
        } boolean;
        struct
        {
            uint8_t count = 0;
            String values[MAX_SELECT_OPTIONS];
        } select;
    };

    struct ResourceUsageFormField
    {
        uint32_t id = 0;
        ResourceUsageFormFieldType type = ResourceUsageFormFieldType::UNKNOWN;
        bool isRequired = false;
        String name;
        String description;
        ResourceUsageFormFieldOptions options;
    };

    struct ResourceUsageForm
    {
        uint32_t id = 0;
        String name;
        uint8_t fieldCount = 0;
        ResourceUsageFormField fields[MAX_FORM_FIELDS_PER_FORM];
    };

    struct ResourceUsageFormRequest
    {
        uint32_t resourceId = 0;
        ResourceUsageFormActionType action = ResourceUsageFormActionType::UNKNOWN;
        String resourceName;
        uint8_t formCount = 0;
        ResourceUsageForm forms[MAX_FORMS_PER_REQUEST];
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
        String stringValue;
        double numberValue = 0;
        bool boolValue = false;
    };

    struct FormSubmission
    {
        uint32_t formId = 0;
        uint8_t answerCount = 0;
        FormSubmissionAnswer answers[MAX_FORM_FIELD_ANSWERS];
    };

    struct FormSubmissionList
    {
        uint8_t submissionCount = 0;
        FormSubmission submissions[MAX_FORM_SUBMISSIONS];
    };

    void setResourceListUpdateCallback(std::function<void(const ResourceList &)> callback);
    void requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength, uint32_t resourceId);

    struct CardAuthenticationDetailsResponse
    {
        uint8_t keyNo;
        uint8_t keyBytes[16];
        uint8_t keyLen;
        String error;
        String username;
        bool canManageResource;
        bool hasIntroduction;
        bool isIntroducer;
    };
    void setCardAuthenticationDetailsResponseCallback(std::function<void(CardAuthenticationDetailsResponse)> callback);

    void setEnrollNewCardGetAvailableKeyNoCallback(std::function<void(String username)> callback);
    void setEnrollNewCardCallback(std::function<void(uint8_t keyNo, String key)> callback);

    void sendEnrollNewCardAvailableKeyNo(uint8_t *uid, uint8_t uidLength, uint8_t keyNo);
    void sendEnrollNewCard(bool success);

    void startResourceUsageSession(uint32_t resourceId, uint32_t projectId = 0, const FormSubmissionList *formSubmissions = nullptr);
    void stopResourceUsageSession(uint32_t resourceId, const FormSubmissionList *formSubmissions = nullptr);
    void lockDoor(uint32_t resourceId);
    void unlockDoor(uint32_t resourceId);
    void unlatchDoor(uint32_t resourceId);
    void triggerFlowButton(uint32_t resourceId, const char *buttonId);

    void requestBillingTopup(uint32_t amountCents);

    void onDeviceName(std::function<void(String)> callback);

    void disableConnectionAttempts();
    void enableConnectionAttempts();

    // Error callback for server responses carrying an error field
    void setErrorCallback(std::function<void(const char *title, const char *message)> callback);
    // Generic action result callback for async operations (start/stop sessions, door controls, flow buttons)
    void setActionResultCallback(std::function<void(const char *type, bool success)> callback);

    // Special-case callback for insufficient balance with server-provided SumUp flag
    void setInsufficientBalanceCallback(std::function<void(bool sumUpEnabled)> callback);

    void requestProjectsOfUser(uint32_t page);
    void setProjectsOfUserResponseCallback(std::function<void(const ProjectsOfUserResponse &)> callback);
    void setResourceFormsRequestCallback(std::function<void(const ResourceUsageFormRequest &)> callback);
    // Get reference to the form request scratch buffer for deferred copy
    const ResourceUsageFormRequest &getFormRequestScratch() const { return resourceFormsRequestScratch; }

private:
    Logger logger;
    Websocket websocket;

    void updateSateInfo();

    bool loopIsEnabled = false;

    unsigned long heartbeat_sent_at = 0;
    bool isRegistered();

    std::function<void(const ResourceList &)> resourceListUpdateCallback;
    std::function<void(CardAuthenticationDetailsResponse)> cardAuthenticationDetailsResponseCallback;

    std::function<void(String)> deviceNameCallback;

    uint32_t lastRequestedProjectsOfUserPage = -1;
    std::function<void(const ProjectsOfUserResponse &)> projectsOfUserResponseCallback;

    void sendAck(const char *type);
    void sendMessage(const char *type);
    void sendMessage(const char *type, JsonObject payload);
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
    std::function<void(const ResourceUsageFormRequest &)> resourceFormsRequestCallback;

    void onRegistrationData(JsonObject data);
    void onUnauthorized(JsonObject data);
    void sendAuthenticationRequest();
    void onReaderAuthenticated(JsonObject data);
    void sendFirmwareInfo();
    void onResourceList(JsonObject data);
    void onProjectsOfUserResponse(JsonObject data);
    void onCardAuthenticationDetailsResponse(JsonObject data);
    void onResourceUsageFormRequest(JsonObject data);
    ResourceUsageFormActionType parseFormAction(const char *action);
    ResourceUsageFormFieldType parseFormFieldType(const char *type);
    void parseFormFieldOptions(ResourceUsageFormField &field, JsonVariantConst options);
    void resetResourceUsageForm(ResourceUsageForm &form);
    void resetResourceUsageFormField(ResourceUsageFormField &field);
    void serializeFormSubmissions(JsonObject payload, const FormSubmissionList *formSubmissions);

    std::function<void(String username)> enrollNewCardGetAvailableKeyNoCallback;
    std::function<void(uint8_t keyNo, String key)> enrollNewCardCallback;

    void onEnrollNewCardGetAvailableKeyNo(JsonObject data);
    void onEnrollNewCard(JsonObject data);

    std::function<void(const char *title, const char *message)> errorCallback;
    std::function<void(const char *type, bool success)> actionResultCallback;
    std::function<void(bool)> insufficientBalanceCallback;

    // Firmware update progress callback with status enum
public:
    void setFirmwareUpdateProgressCallback(std::function<void(int)> callback);
    void setFirmwareUpdateMetaCallback(std::function<void(String availableVersion)> callback);

private:
    std::function<void(int)> firmwareUpdateProgressCallback;
    std::function<void(String availableVersion)> firmwareUpdateMetaCallback;

    // OTA state
    struct OtaState
    {
        bool inProgress = false;
        uint32_t totalSize = 0;
        esp_ota_handle_t otaHandle = 0;
        const esp_partition_t *updatePartition = nullptr;
        int lastReportedPercent = -1;
        uint32_t bytesWritten = 0;
    } ota;

    void startFirmwareUpdate(JsonObject firmwareMeta);
    bool readyForNextFirmwareChunk = false;
    void requestNextFirmwareChunk();
    void onFirmwareChunkEvent(esp_websocket_event_data_t data);
    uint32_t lastFirmwareChunkRequestTimeMs = 0;
    const uint32_t FIRMWARE_CHUNK_REQUEST_RESPONSE_TIMEOUT_MS = 30000;
    uint32_t firmwareUpdateFailedTimeMs = 0;
    void abortFirmwareUpdate(const char *reason);
    void updateFirmwareProgress(int percent);

    // Chunk reception tracking to avoid interleaving/overlap across WS fragments
    uint32_t currentChunkExpectedBytes = 0;
    uint32_t currentChunkReceivedBytes = 0;
};