#pragma once

#include <string>

#include "esp_netif.h"
#include "../network/wifi/wifi.hpp"
#include "../logger/logger.hpp"

class SerialCommandHandler
{
public:
    static void setup();
    static void loop();

private:
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
};
