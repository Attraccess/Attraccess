#pragma once

#include <Arduino.h>
#include "esp_netif.h"
#include "../network/wifi/wifi.hpp"
#include "../logger/logger.hpp"

class SerialCommandHandler
{
public:
    static void setup();
    static void loop();
    static void processLine(const String &line);

private:
    static constexpr size_t MAX_COMMAND_LENGTH = 256;

    static String inputBuffer;
    static Logger logger;
    static void handleCommand(const String &topic, const String &payload);

    static bool pinIsSet();
    static bool validateNewCode(const char *code);
    static bool ensureAuthorized(const char *codeFromPayload, String &errorOut);

    static String ipToString(const esp_ip4_addr_t &ip);
    static const char *encryptionTypeToString(wifi_auth_mode_t mode);

    static void sendJsonResponse(const String &topic, const String &payload);
    static void sendErrorResponse(const String &topic, const char *error);
};
