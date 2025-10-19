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
    Application() : logger("Application"), api(), unlocked(false), resourceCount(0), resourceIsSelected(false), bootDone(false) {}

    void setup();
    void loop();

private:
    NFC nfc;
    Logger logger;
    API api;
    IOExpander ioExpander;

    static void networkTask(void *parameter);

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
    // Own a persistent copy of the latest resource list to avoid dangling references
    API::ResourceList resourceList;

    void selectResource(const API::ResourceBrief &resource);

    enum applicationState_t
    {
        APPLICATION_STATE_BOOT,
        APPLICATION_STATE_PIN_NOT_SET,
        APPLICATION_STATE_CONFIGURATION_REQUIRED,
        APPLICATION_STATE_INIT,
        APPLICATION_STATE_CUSTOM,
        APPLICATION_STATE_LOCKED,
        APPLICATION_STATE_NO_RESOURCES,
        APPLICATION_STATE_RESOURCE_LIST,
        APPLICATION_STATE_UNLOCKED,
        APPLICATION_STATE_ENROLLMENT
    };
    applicationState_t state;

    void handleResourceListUpdate(const API::ResourceList &resourceList);
    void handleCardAuthenticationDetails(API::CardAuthenticationDetailsResponse response);

    void handleResourceDetailsButtonClick(ResourceDetailsScreen::ButtonClickEventData evt);

    // Action pause tracking (while server actions are running)
    void beginActionPause();
    void endActionPause();

    uint32_t pauseStartMs = 0;
    uint32_t accumulatedPauseMs = 0;
    uint16_t actionInProgressCount = 0;
};