#pragma once

#include <Arduino.h>
#include "../nfc/nfc.hpp"
#include "../display/display.hpp"
#include "../logger/logger.hpp"
#include "settings/settings.hpp"
#include "../network/network.hpp"
#include "../api/api.hpp"
#include "../ioexpander/ioexpander.hpp"
#include "../utils.hpp"

#define APPLICATION_BOOT_SCREEN_DURATION 2000

class Application
{
public:
    Application() : logger("Application"),
                    api(),
                    unlocked(false),
                    resourceCount(0),
                    resourceIsSelected(false),
                    bootDone(false),
                    externalState(EXTERNAL_STATE_NONE),
                    resourceListUpdated(false),
                    selectedResourceChanged(false),
                    firmwareUpdateProgressPct(0)
    {
    }

    void setup();
    void loop();

private:
    NFC nfc;
    Logger logger;
    API api;
    IOExpander ioExpander;

    enum ExternalStates_t
    {
        EXTERNAL_STATE_NONE,
        EXTERNAL_STATE_ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO,
        EXTERNAL_STATE_ENROLL_NEW_CARD,
        EXTERNAL_STATE_AUTHENTICATE_CARD,
        EXTERNAL_STATE_FIRMWARE_UPDATE,
    };

    ExternalStates_t externalState;
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

    API::CardAuthenticationDetailsResponse cardAuthenticationData;

    int firmwareUpdateProgressPct;

    String availableFirmwareVersion;

    static void
    networkTask(void *parameter);

    void processState();
    void handleConnectionConfigurationSave(const ConnectionConfigurationScreen::ConnectionConfig &cfg);
    void handleTouch(int16_t x, int16_t y);

    uint32_t bootTime;
    bool bootDone;

    bool unlocked;
    uint32_t timeOfUnlockedMs;
    const uint32_t UNLOCKED_TIMEOUT_MS = 30000;
    void restartSessionTimeout();
    void resetPauseAccounting();

    uint32_t timeOfResourceSelectionMs;
    const uint32_t RESOURCE_SELECTION_TIMEOUT_MS = 10000;
    void restartResourceSelectionTimeout();

    uint8_t resourceCount;
    bool resourceIsSelected;
    uint32_t selectedResourceId;
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

    void selectResource(const API::ResourceBrief &resource);
    void requestProjectsPage(uint32_t page);
    void clearProjectSelection();
    void handleProjectSelection(uint32_t projectId, const String &projectName);

    enum applicationState_t
    {
        APPLICATION_STATE_BOOT,
        APPLICATION_STATE_PIN_NOT_SET,
        APPLICATION_STATE_CONFIGURATION_REQUIRED,
        APPLICATION_STATE_INIT,
        APPLICATION_STATE_CUSTOM,
        APPLICATION_STATE_LOCKED,
        APPLICATION_STATE_AUTHENTICATE_CARD,
        APPLICATION_STATE_NO_RESOURCES,
        APPLICATION_STATE_RESOURCE_LIST,
        APPLICATION_STATE_UNLOCKED,
        APPLICATION_STATE_ENROLLMENT,
        APPLICATION_STATE_FIRMWARE_UPDATE
    };
    applicationState_t state;

    void handleResourceListUpdate(const API::ResourceList &resourceList);
    void processCardAuthenticationData();

    void handleResourceDetailsButtonClick(ResourceDetailsScreen::ButtonClickEventData evt);

    // Action pause tracking (while server actions are running)
    void beginActionPause();
    void endActionPause();

    uint32_t pauseStartMs = 0;
    uint32_t accumulatedPauseMs = 0;
    uint16_t actionInProgressCount = 0;
};