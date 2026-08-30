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

    enum NetworkQuality
    {
        NETWORK_QUALITY_GOOD,
        NETWORK_QUALITY_DEGRADED,
        NETWORK_QUALITY_OFFLINE,
    };

    struct NetworkQualityState
    {
        NetworkQuality quality;
        uint32_t lastInboundAgeMs;
        bool hasInboundMessage;
        uint8_t reconnectsLastMinute;
        uint8_t txQueueDepth;
        uint8_t txQueueFullEventsLastMinute;
        uint8_t sendFailuresLastMinute;
        uint8_t livenessTimeoutsLastMinute;
        uint32_t lastPongRttMs;
        uint32_t averagePongRttMs;
        int32_t pongRttTrendMs;
        bool hasPongRttSample;
        uint8_t pongTimeoutsLastMinute;
        uint8_t pongProbeLossPercentLastMinute;
        bool hasCompletedPongProbe;
        uint8_t missedHeartbeatsLastMinute;
    };

    static void setNetworkQualityState(NetworkQuality quality,
                                       uint32_t lastInboundAgeMs,
                                       bool hasInboundMessage,
                                       uint8_t reconnectsLastMinute,
                                       uint8_t txQueueDepth,
                                       uint8_t txQueueFullEventsLastMinute,
                                       uint8_t sendFailuresLastMinute,
                                       uint8_t livenessTimeoutsLastMinute,
                                       uint32_t lastPongRttMs,
                                       uint32_t averagePongRttMs,
                                       int32_t pongRttTrendMs,
                                       bool hasPongRttSample,
                                       uint8_t pongTimeoutsLastMinute,
                                       uint8_t pongProbeLossPercentLastMinute,
                                       bool hasCompletedPongProbe,
                                       uint8_t missedHeartbeatsLastMinute);
    static NetworkQualityState getNetworkQualityState();

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
    static void setWebsocketCertProgress(std::string certName, int certIndex, int certCount, int rememberedRetryCount, bool certLocked);
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
        bool certLocked;
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
    static NetworkQuality network_quality;
    static uint32_t network_quality_last_inbound_age_ms;
    static bool network_quality_has_inbound_message;
    static uint8_t network_quality_reconnects_last_minute;
    static uint8_t network_quality_tx_queue_depth;
    static uint8_t network_quality_tx_queue_full_events_last_minute;
    static uint8_t network_quality_send_failures_last_minute;
    static uint8_t network_quality_liveness_timeouts_last_minute;
    static uint32_t network_quality_last_pong_rtt_ms;
    static uint32_t network_quality_average_pong_rtt_ms;
    static int32_t network_quality_pong_rtt_trend_ms;
    static bool network_quality_has_pong_rtt_sample;
    static uint8_t network_quality_pong_timeouts_last_minute;
    static uint8_t network_quality_pong_probe_loss_percent_last_minute;
    static bool network_quality_has_completed_pong_probe;
    static uint8_t network_quality_missed_heartbeats_last_minute;

    static uint16_t websocket_port;
    static bool websocket_use_ssl;
    static bool websocket_connected;
    static WebsocketPhase websocket_phase;
    static std::string websocket_cert_name;
    static int websocket_cert_index;
    static int websocket_cert_count;
    static int websocket_remembered_retry_count;
    static bool websocket_cert_locked;
    static int websocket_next_attempt_seconds;

    static bool api_authenticated;
    static std::string api_device_name;
};
