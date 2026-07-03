#pragma once

#include <esp_netif.h>
#include <ArduinoJson.h>
#include <string>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

class State
{
public:
    static void setWifiState(bool connected, esp_ip4_addr_t ip, std::string ssid);
    static void setEthernetState(bool connected, esp_ip4_addr_t ip);
    struct NetworkState
    {
        bool wifi_connected;
        esp_ip4_addr_t wifi_ip;
        std::string wifi_ssid;
        bool ethernet_connected;
        esp_ip4_addr_t ethernet_ip;
    };
    static NetworkState getNetworkState();

    // Connection phase of the websocket client. Mirrors Websocket::ConnectionState
    // so the connecting screen can show where the device is without depending on
    // the websocket header.
    enum WebsocketPhase
    {
        WS_INIT,
        WS_CONNECTING,
        WS_CONNECTED,
    };

    static void setWebsocketState(bool connected, std::string hostname, uint16_t port, bool useSSL);
    static void setWebsocketPhase(WebsocketPhase phase);
    // Cert sweep progress (only meaningful while connecting over SSL).
    static void setWebsocketCertProgress(std::string certName, int certIndex, int certCount, int rememberedRetryCount);
    // Seconds until the next reconnect attempt (negative/zero means "now").
    static void setWebsocketNextAttemptSeconds(int seconds);
    struct WebsocketState
    {
        bool connected;
        std::string hostname;
        uint16_t port;
        bool useSSL;
        WebsocketPhase phase;
        std::string certName;
        int certIndex;
        int certCount;
        int rememberedRetryCount;
        int secondsUntilNextAttempt;
    };
    static WebsocketState getWebsocketState();

    static void setApiState(bool authenticated, std::string deviceName);
    struct ApiState
    {
        bool authenticated;
        std::string deviceName;
    };
    static ApiState getApiState();

private:
    State() = delete;

    static SemaphoreHandle_t state_mutex;

    static esp_ip4_addr_t wifi_ip;
    static bool wifi_connected;
    static std::string wifi_ssid;

    static esp_ip4_addr_t ethernet_ip;
    static bool ethernet_connected;

    static std::string websocket_hostname;
    static uint16_t websocket_port;
    static bool websocket_use_ssl;
    static bool websocket_connected;
    static WebsocketPhase websocket_phase;
    static std::string websocket_cert_name;
    static int websocket_cert_index;
    static int websocket_cert_count;
    static int websocket_remembered_retry_count;
    static int websocket_next_attempt_seconds;

    static bool api_authenticated;
    static std::string api_device_name;
};