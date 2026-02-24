#pragma once

#include <Arduino.h>
#include "../settings/settings.hpp"
#include <functional>
#include "../state/state.hpp"
#include "../logger/logger.hpp"
#include "certManager/AdaptiveCertManager.hpp"

#if defined(CONFIG_IDF_TARGET_ESP32P4)
// P4 stub: esp_websocket_client not available on ESP32-P4 platform yet
struct esp_websocket_event_data_t
{
    void *data_ptr;
    size_t data_len;
    size_t payload_len;
    size_t payload_offset;
};
using esp_websocket_client_handle_t = void *;
#else
#include "esp_websocket_client.h"
#endif

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
    uint32_t lastReconnectAttemptTime;
    const uint32_t RECONNECT_INTERVAL_MS = 10000;

    bool network_is_connected = false;

    AttraccessApiConfig _lastApiConfig;

    ConnectionState _state = INIT;
    void setState(ConnectionState state);

    esp_websocket_client_handle_t ws_client = nullptr;

#if !defined(CONFIG_IDF_TARGET_ESP32P4)
    static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);
    void processWebSocketEvent(esp_event_base_t base, int32_t event_id, void *event_data);
#endif

    Logger logger;
};
