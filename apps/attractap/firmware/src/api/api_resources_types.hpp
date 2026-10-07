#pragma once

#include <string>
#include <vector>
#include <cstdint>
#include <cstddef>

struct ApiResources
{
    static constexpr size_t MAX_RESOURCES = 10;

    static constexpr size_t MAX_RESOURCE_NAME_LEN = 64;

    // 32 username characters plus the terminator.
    static constexpr size_t MAX_USERNAME_LEN = 33;

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
        bool accessKnown = false;
        bool canManageMaintenance = false;
        bool hasIntroduction = false;
        bool isIntroducer = false;
        bool canManageResource = false;
        bool requiresSupervisor = false;
        char name[MAX_RESOURCE_NAME_LEN];
        std::string description;
        bool hasActiveUsage;
        uint32_t activeUsageId = 0;
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
        uint32_t requestId = 0;
        uint16_t count;
        char authenticatedUsername[MAX_USERNAME_LEN] = {};
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

struct UsageStats
    {
        uint32_t resourceId = 0;
        uint32_t usageId = 0;
        int64_t operatingDurationMs = -1; // -1 means no operating data
        int8_t isOperating = -1; // -1 unknown, 0 idle, 1 running
        std::string energyKwh;
    };

struct ActionResult {
        std::string type;
        bool success = false;
        uint32_t requestId = 0;
        std::string error;
        bool sumUpEnabled = false;
        std::string billingTotal{};
    };
};
