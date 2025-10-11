#pragma once

#include <Arduino.h>
#include "../nfc/nfc.hpp"
#include "../display/display.hpp"
#include "../logger/logger.hpp"
#include "settings/settings.hpp"
#include "../cli/CLIService.hpp"
#include "../serial-setup/serial-setup.hpp"
#include "../network/network.hpp"

#define APPLICATION_BOOT_SCREEN_DURATION 2000

class Application
{
public:
    Application() : logger("Application") {}

    void setup();
    void loop();

private:
    NFC nfc;
    Logger logger;
    CLIService cliService;

    void processState();
    void handleConnectionConfigurationSave(const ConnectionConfigurationScreen::ConnectionConfig &cfg);

    uint32_t bootTime;
    bool bootDone;

    enum applicationState_t
    {
        APPLICATION_STATE_BOOT,
        APPLICATION_STATE_PIN_NOT_SET,
        APPLICATION_STATE_CONFIGURATION_REQUIRED,
        APPLICATION_STATE_INIT,
        APPLICATION_STATE_CUSTOM,
        APPLICATION_STATE_LOCKED
    };
    applicationState_t state;
};