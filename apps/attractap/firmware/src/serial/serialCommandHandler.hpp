#pragma once

#include <string>

#ifndef ATTRACTAP_HOST
#include "esp_netif.h"
#include "../network/wifi/wifi.hpp"
#endif
#include "../logger/logger.hpp"

class SerialCommandHandler
{
public:
#ifdef ATTRACTAP_HOST
    static void setup() {}
    static void loop() {}
#else
    static void setup();
    static void loop();
#endif

private:
#ifndef ATTRACTAP_HOST
    static constexpr size_t MAX_COMMAND_LENGTH = 256;

    static std::string inputBuffer;
    static Logger logger;

    static void processLine(const std::string &line);
    static void handleCommand(const std::string &topic, const std::string &payload);

    static bool pinIsSet();
    static bool validateNewCode(const char *code);
    static bool ensureAuthorized(const char *codeFromPayload, std::string &errorOut);

    static std::string ipToString(const esp_ip4_addr_t &ip);
    static const char *encryptionTypeToString(wifi_auth_mode_t mode);

    static void sendJsonResponse(const std::string &topic, const std::string &payload);
    static void sendErrorResponse(const std::string &topic, const char *error);
#endif
};
