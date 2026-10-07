#pragma once
#include "api_cards_types.hpp"
#include <functional>
#include <atomic>
#include <ArduinoJson.h>

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
    std::function<void(const char *title, const char *message)> errorCallback;
    std::function<void(const ActionResult &)> actionResultCallback;
    std::function<void(bool)> insufficientBalanceCallback;
    std::function<void(int)> firmwareUpdateProgressCallback;
    std::function<void(std::string availableVersion)> firmwareUpdateMetaCallback;
};
