#pragma once

#include <Arduino.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_netif.h"
#include "esp_log.h"
#include "../cli/CLIService.hpp"
#include "../api/api.hpp"
#include "../websocket/websocket.hpp"
#include "../state/state.hpp"
#include "task_priorities.h"

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

private:
    static void startBackgroundTask();
    static void taskFn(void *param);
    static void processWifiEvents();
    static TaskHandle_t taskHandle;
    static CLIService *cliService;
    static API *api;
    static Websocket *websocket;

    static void handleFirmwareVersion(const String &payload);
    static void handleAttraccessStatus(const String &payload);
    static void handleAttraccessConfiguration(const String &payload);

    static String wifiGetEncryptionTypeString(wifi_auth_mode_t encType);

    static String getEncryptionTypeString(wifi_auth_mode_t encType);
    static void handleWiFiScan(const String &payload);
    static void handleWiFiConnect(const String &payload);
    static void handleNetworkStatus(const String &payload);
};