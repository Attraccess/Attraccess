#pragma once

#include <Arduino.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "esp_websocket_client.h"
#include "../settings/settings.hpp"
#include <functional>
#include "../state/state.hpp"
#include "../logger/logger.hpp"
#include "certManager/AdaptiveCertManager.hpp"

class Websocket
{
public:
    Websocket() : logger("Websocket") {}

    enum ConnectionState
    {
        INIT,
        CONNECTING,
        CONNECTED,
    };
    void setup();
    void loop();
    void sendMessage(const String &message);
    void sendMessage(const char *message, size_t length);
    void setMessageCallbackRaw(std::function<void(const char *, size_t)> callback);
    void setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)> callback);

    void enableConnectionAttempts();
    void disableConnectionAttempts();

private:
    std::function<void(const char *, size_t)> messageCallbackRaw;
    std::function<void(esp_websocket_event_data_t)> binaryDataCallback;

    AdaptiveCertManager _certManager;

    bool connectionAttemptsEnabled = true;

    void updateInfoFromAppState();
    void connectWebSocket();
    bool shouldReconnect();
    uint32_t lastReconnectAttemptTime = 0;

    const uint32_t RECONNECT_BACKOFF_BASE_MS = 10000;
    const uint32_t RECONNECT_BACKOFF_MAX_MS = 60000;
    uint32_t reconnectBackoffMs = 10000;
    void growReconnectBackoff();
    void resetReconnectBackoff();

    uint32_t lastHeapLogTime = 0;
    const uint32_t HEAP_LOG_INTERVAL_MS = 30000;
    void logHeapStats();

    uint32_t lastInboundFrameTime = 0;
    const uint32_t INBOUND_LIVENESS_TIMEOUT_MS = 20000;
    const int PINGPONG_TIMEOUT_SEC = 10;

    bool network_is_connected = false;

    AttraccessApiConfig _lastApiConfig;
    int _clientCertIndex = -1;

    ConnectionState _state = INIT;
    void setState(ConnectionState state);

    esp_websocket_client_handle_t ws_client = nullptr;
    SemaphoreHandle_t ws_client_mutex = nullptr;
    void lockWsClient();
    void unlockWsClient();

    static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);
    void processWebSocketEvent(esp_event_base_t base, int32_t event_id, void *event_data);

    Logger logger;
};