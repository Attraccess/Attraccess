#pragma once

#include <esp_netif.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

class State
{
public:
    static void setWifiState(bool connected, esp_ip4_addr_t ip, String ssid);
    static void setEthernetState(bool connected, esp_ip4_addr_t ip);
    struct NetworkState
    {
        bool wifi_connected;
        esp_ip4_addr_t wifi_ip;
        String wifi_ssid;
        bool ethernet_connected;
        esp_ip4_addr_t ethernet_ip;
    };
    static NetworkState getNetworkState();

    static void setWebsocketState(bool connected, String hostname, uint16_t port, bool useSSL);
    struct WebsocketState
    {
        bool connected;
        String hostname;
        uint16_t port;
        bool useSSL;
    };
    static WebsocketState getWebsocketState();

    static void setApiState(bool authenticated, String deviceName);
    struct ApiState
    {
        bool authenticated;
        String deviceName;
    };
    static ApiState getApiState();

private:
    State() = delete;

    static SemaphoreHandle_t state_mutex;

    static esp_ip4_addr_t wifi_ip;
    static bool wifi_connected;
    static String wifi_ssid;

    static esp_ip4_addr_t ethernet_ip;
    static bool ethernet_connected;

    static String websocket_hostname;
    static uint16_t websocket_port;
    static bool websocket_use_ssl;
    static bool websocket_connected;

    static bool api_authenticated;
    static String api_device_name;
};