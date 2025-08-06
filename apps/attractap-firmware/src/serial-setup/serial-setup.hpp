#pragma once

#include <Arduino.h>
#include "esp_netif.h"
#include "esp_log.h"
#include "../cli/CLIService.hpp"
#include "../api/api.hpp"

class SerialSetup
{
public:
    static void setup(CLIService *cliService, API *api);

private:
    static CLIService *cliService;
    static API *api;

    static String handleFirmwareVersion(const String &payload);
    static String handleAttraccessStatus(const String &payload);
    static String handleAttraccessConfiguration(const String &payload);

    static String wifiGetEncryptionTypeString(wifi_auth_mode_t encType);
};