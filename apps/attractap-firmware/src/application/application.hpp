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

    uint32_t bootTime;
    bool bootDone;
    bool unlocked;
    uint32_t timeOfUnlockedMs;
    const uint32_t UNLOCKED_TIMEOUT_MS = 30000;
    uint8_t resourceCount;
    bool resourceIsSelected;

    void selectResource(JsonObject resource);

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
        APPLICATION_STATE_UNLOCKED
    };
    applicationState_t state;

    void handleResourceListUpdate(JsonArray resourceList);
    void handleCardAuthenticationDetails(uint8_t keyNo, const uint8_t *keyBytes, uint8_t keyLen, String error);
};