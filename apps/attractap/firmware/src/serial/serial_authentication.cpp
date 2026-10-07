#include "serialCommandHandler.hpp"

#ifndef ATTRACTAP_HOST

#include <ArduinoJson.h>
#include <lwip/inet.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/usb_serial_jtag.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "../settings/settings.hpp"
#include "../network/wifi/wifi.hpp"
#include "../state/state.hpp"
#include "../utils.hpp"
#include "platform.hpp"

bool SerialCommandHandler::pinIsSet()
{
    return Settings::getDeviceConfig().passCode != "0000";
}

bool SerialCommandHandler::validateNewCode(const char *code)
{
    if (!code)
    {
        return false;
    }
    size_t len = strlen(code);
    if (len != 4)
    {
        return false;
    }
    for (size_t i = 0; i < len; i++)
    {
        if (code[i] < '0' || code[i] > '9')
        {
            return false;
        }
    }
    return true;
}

bool SerialCommandHandler::ensureAuthorized(const char *codeFromPayload, std::string &errorOut)
{
    if (!pinIsSet())
    {
        return true;
    }

    if (!codeFromPayload)
    {
        errorOut = "MISSING_AUTH_CODE";
        return false;
    }

    if (Settings::getDeviceConfig().passCode != std::string(codeFromPayload))
    {
        errorOut = "INVALID_AUTH_CODE";
        return false;
    }

    return true;
}

std::string SerialCommandHandler::ipToString(const esp_ip4_addr_t &ip)
{
    char buf[16];
    snprintf(buf, sizeof(buf), IPSTR, IP2STR(&ip));
    return std::string(buf);
}

const char *SerialCommandHandler::encryptionTypeToString(wifi_auth_mode_t mode)
{
    switch (mode)
    {
    case WIFI_AUTH_OPEN:
        return "OPEN";
    case WIFI_AUTH_WEP:
        return "WEP";
    case WIFI_AUTH_WPA_PSK:
        return "WPA_PSK";
    case WIFI_AUTH_WPA2_PSK:
        return "WPA2_PSK";
    case WIFI_AUTH_WPA_WPA2_PSK:
        return "WPA_WPA2_PSK";
    case WIFI_AUTH_WPA2_ENTERPRISE:
        return "WPA2_ENTERPRISE";
    case WIFI_AUTH_WPA3_PSK:
        return "WPA3_PSK";
    case WIFI_AUTH_WPA2_WPA3_PSK:
        return "WPA2_WPA3_PSK";
    default:
        return "UNKNOWN";
    }
}


#endif
