#pragma once

#include <Arduino.h>
#include "esp_netif.h"
#include "esp_log.h"
#include "../cli/CLIService.hpp"
#include "../api/api.hpp"
#include "../websocket/websocket.hpp"

class SerialSetup
{
public:
    struct WifiNetwork
    {
        String ssid;
        int32_t rssi;
        wifi_auth_mode_t encryptionType;
        bool isOpen;
        uint8_t channel;
    };

    static void setup(CLIService *cliService, API *api, Websocket *websocket);

    static void onWifiScanDone(WifiNetwork *networks, uint8_t count);
    static void setOnWifiScanStartHandler(void (*handler)());

private:
    static CLIService *cliService;
    static API *api;
    static Websocket *websocket;

    static String handleFirmwareVersion(const String &payload);
    static String handleAttraccessStatus(const String &payload);
    static String handleAttraccessConfiguration(const String &payload);

    static String wifiGetEncryptionTypeString(wifi_auth_mode_t encType);

    static void (*onWifiScanStart)();

    static String getEncryptionTypeString(wifi_auth_mode_t encType);
    static String handleWiFiScan(const String &payload);
    static String handleWiFiConnect(const String &payload);
};