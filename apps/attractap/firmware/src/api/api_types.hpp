#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <cstddef>

struct ApiResources
{
    static constexpr size_t MAX_RESOURCES = 10;
    static constexpr size_t MAX_LISTED_SESSIONS = 16;

    static constexpr size_t MAX_RESOURCE_NAME_LEN = 64;

    // 32 username characters plus the terminator.
    static constexpr size_t MAX_USERNAME_LEN = 33;

    // Display names ("First Last", or the username) are for the screen only; the username stays the identity key.
    // Room for 79 bytes plus the terminator; a longer name is cut and the screen shows it with an ellipsis.
    static constexpr size_t MAX_DISPLAY_NAME_LEN = 80;

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

struct ActiveSession
    {
        uint32_t id = 0;
        char username[MAX_USERNAME_LEN] = {};
        // What the screen shows; the username when the server sends no display name.
        char displayName[MAX_DISPLAY_NAME_LEN] = {};
    };

// What changing the project of a running session applies to: the whole session, or only the time from now on.
enum class ProjectChangeMode : uint8_t
{
    WHOLE_SESSION,
    SPLIT,
};

struct ResourceBrief
    {
        uint32_t id;
        uint8_t type; // 0: machine, 1: door (encode from API strings)
        bool separateUnlockAndUnlatch;
        // Access-only door: its only action is Open (sent as an unlock); it is never locked or unlatched from here.
        bool accessOnly = false;
        bool allowTakeOver;
        bool accessKnown = false;
        bool canManageMaintenance = false;
        bool hasIntroduction = false;
        bool isIntroducer = false;
        bool canManageResource = false;
        // Per card: may end another person's session here (resources.update or the server's maintain rule).
        bool canEndOtherSessions = false;
        bool requiresSupervisor = false;
        char name[MAX_RESOURCE_NAME_LEN];
        std::string description;
        bool hasActiveUsage;
        uint32_t activeUsageId = 0;
        // Parallel sessions (ATT-1189). Defaults describe a classic single-session machine.
        uint16_t maxParallelSessions = 1;
        uint16_t activeSessionCount = 0;
        // Per card: a slot is free and the authenticated user has no session of their own.
        bool canStart = true;
        // The authenticated user's own session; activeUser/activeUsageId point at it when present.
        bool hasOwnUsage = false;
        uint32_t ownUsageId = 0;
        // Session duration (ATT-43, machines only). The reader asks for an estimate before a start when required.
        bool requireSessionDurationEstimate = false;
        // Longest session in minutes; 0 means the machine has no maximum.
        uint32_t maxSessionDurationMinutes = 0;
        // The automatic end of the session shown (activeUsageId: the own one, else the active one). The seconds are
        // relative to `autoEndReceivedMs` (millis() when the list arrived), so the countdown needs no wall clock;
        // `autoEndEpoch` (0 when unknown) gives the stop time.
        bool hasAutoEnd = false;
        bool hasMaxSessionTime = false;
        uint32_t autoEndInSeconds = 0;
        uint32_t extendLimitInSeconds = 0;
        uint32_t autoEndReceivedMs = 0;
        uint32_t autoEndEpoch = 0;
        int16_t autoEndUtcOffsetMinutes = 0;
        // Project switch (ATT-1421, capabilities.projectSwitch): the server offers it for the card holder's own
        // running session, and says which project that is booked to (0: none). Older servers send nothing.
        bool canSwitchProject = false;
        uint32_t ownProjectId = 0;
        std::string ownProjectName;
        // The running record continues an earlier split, so moving it leaves the earlier parts where they are.
        bool ownSessionContinued = false;
        // Every active session (bounded) so managers can end a chosen one.
        std::vector<ActiveSession> activeSessions;
        // Parallel UI: a limit lowered to 1 while several sessions run still lists them so each can be stopped.
        bool isMultiSession() const { return type == 0 && (maxParallelSessions > 1 || activeSessionCount > 1); }
        bool isFull() const { return activeSessionCount >= maxParallelSessions; }
        // Whether `username` holds a session here; only a list personalised for them knows it for sure.
        bool isOwnedBy(const std::string &username, bool personalized) const
        {
            if (username.empty()) return false;
            if (personalized) return hasOwnUsage;
            return hasActiveUsage && username == activeUser;
        }
        bool isUnderMaintenance;
        bool isHealthy;
        char healthReason[MAX_HEALTH_REASON_LEN];
        char activeUser[MAX_USERNAME_LEN];
        char activeUserDisplayName[MAX_DISPLAY_NAME_LEN]; // display only, never compared
        uint32_t activeStartEpoch;          // seconds since epoch (UTC)
        int16_t activeStartUtcOffsetMinutes; // server tz offset (minutes east of UTC) for that instant
        std::vector<std::string> introducers;
        // Same order as `introducers`; empty (an older server) or a different length means show the usernames.
        std::vector<std::string> introducerDisplayNames;
        uint8_t flowButtonCount;
        FlowButton flowButtons[MAX_FLOW_BUTTONS];
    };

struct ResourceList
    {
        uint32_t requestId = 0;
        uint16_t count;
        char authenticatedUsername[MAX_USERNAME_LEN] = {};
        char authenticatedDisplayName[MAX_DISPLAY_NAME_LEN] = {};
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
        // Name filter these results were produced for; empty lists all projects.
        std::string search;
        Project items[MAX_PROJECTS_PER_PAGE];
    };

struct UsageStats
    {
        uint32_t resourceId = 0;
        uint32_t usageId = 0;
        int64_t operatingDurationMs = -1; // -1 means no operating data
        int8_t isOperating = -1; // -1 unknown, 0 idle, 1 running
        struct MeterValue {
            std::string name;
            std::string value;
            int64_t creditsPerUnit = -1; // -1 means no captured rate was provided
            std::string formattedRate;
        };
        std::vector<MeterValue> meters;
    };

struct ActionResult {
        std::string type;
        bool success = false;
        uint32_t requestId = 0;
        std::string error;
        bool sumUpEnabled = false;
        std::string billingTotal{};
        bool hasDuration = false;
        uint32_t durationSeconds = 0;
        bool hasOwnership = false;
        bool endedOwnSession = false;
        // START_BLOCKED: the plugin's literal reason (already sanitized to Latin-1 for the display).
        std::string blockCode{};
        std::string blockTitle{};
        std::string blockBody{};
        // allow-with-warning: the start went through but the plugin asked for attention.
        bool warning = false;
        // SWITCH_SESSION_PROJECT: the project the session continues under; empty without one.
        std::string projectName{};
    };
};

struct ApiForms : public ApiResources
{
enum class ResourceUsageFormActionType : uint8_t
    {
        UNKNOWN,
        START,
        END,
        TAKEOVER,
        PROJECT_SWITCH,
        PROJECT_REASSIGN,
    };

enum class ResourceUsageFormFieldType : uint8_t
    {
        UNKNOWN,
        TEXT,
        NUMBER,
        BOOLEAN,
        SELECT,
        IMAGE, // photos are added on the user's phone: the reader only shows a QR code and a count
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
        // IMAGE fields only: the page the QR code opens on the phone, and the photos added so far.
        std::string handoffUrl;
        uint16_t imageCount = 0;
        uint16_t maxImages = 1;
    };

struct ResourceUsageFormMeta
    {
        uint32_t id = 0;
        std::string name;
        uint32_t fieldCount = 0;
    };

struct ResourceUsageFormRequest
    {
        uint32_t requestId = 0;
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
            std::string code;
        } errors[MAX_FORM_PAGE_ERRORS];
    };
};

struct ApiCards : public ApiForms
{
// The server verified the card before it sends this: it ran the card crypto through the relay.
// There is no key material on the reader.
struct CardAuthenticationDetailsResponse
    {
        std::string error;
        std::string username;
        // For the screen; the username when the server sends none.
        std::string displayName;
        std::string language;
        // Issued per card authentication; sent back on START and on CARD_SESSION_ENDED.
        std::string cardSessionId;
        bool canManageResource;
        bool hasIntroduction;
        bool isIntroducer;
        // Two-card supervision (ATT-493). supervisionMode is the resource policy; requiresSupervisor
        // is the server's verdict for this user (true => starting a session requires supervisor
        // approval; authentication itself still unlocks the resource details screen).
        std::string supervisionMode;
        bool requiresSupervisor;
    };

struct SupervisionRequestResult
    {
        bool success = false;
        std::string error;
        uint32_t timeoutMs = 0;
        uint8_t supervisorCount = 0;
        std::string supervisorNames[MAX_INTRODUCERS];
        // Same order as supervisorNames, shown on screen; the usernames when the server sends none.
        std::string supervisorDisplayNames[MAX_INTRODUCERS];
    };

struct SupervisorCardAuthenticationResponse
    {
        std::string error;
        std::string username;
        std::string displayName;
    };

struct SupervisionResolvedResult
    {
        bool success = false;
        std::string error;
        std::string supervisorUsername;
        std::string supervisorDisplayName;
    };

struct SupervisionStartCommand
    {
        uint32_t resourceId = 0;
        uint32_t timeoutMs = 0;
        std::string requesterUsername;
        std::string requesterDisplayName;
    };
};
