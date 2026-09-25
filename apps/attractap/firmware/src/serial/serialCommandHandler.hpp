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

    // True while the web config tool is actively driving the device over USB
    // serial (a valid CMND arrived recently). Used to suppress the on-device
    // config/PIN screens, whose input fields would go stale while the web tool
    // changes settings underneath them (ATT-556).
    static bool isWebConfigSessionActive();

private:
    static constexpr size_t MAX_COMMAND_LENGTH = 256;
    // Sliding window: the session ends this long after the last command. Long
    // enough to cover the user typing wifi credentials between commands, short
    // enough that an abandoned web session gives the device screens back.
    static constexpr uint32_t WEB_CONFIG_SESSION_TIMEOUT_MS = 3 * 60 * 1000;

    static String inputBuffer;
    static Logger logger;
    static uint32_t lastCommandReceivedMs;
    static bool anyCommandReceived;

    static void processLine(const String &line);
    static void handleCommand(const String &topic, const String &payload);

    static bool pinIsSet();
    static bool validateNewCode(const char *code);
    static bool ensureAuthorized(const char *codeFromPayload, String &errorOut);

    static String ipToString(const esp_ip4_addr_t &ip);
    static const char *encryptionTypeToString(wifi_auth_mode_t mode);

    static void sendJsonResponse(const String &topic, const String &payload);
    static void sendErrorResponse(const String &topic, const char *error);
};
