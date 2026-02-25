#pragma once

#include <Arduino.h>
#if !defined(CONFIG_IDF_TARGET_ESP32P4)
#include "esp_websocket_client.h"
#else
// P4 stub: esp_websocket_client not available; use placeholder types
typedef void *esp_websocket_client_handle_t;
struct esp_websocket_event_data_t {
    void *data_ptr;
    int data_len;
    size_t payload_len;
    size_t payload_offset;
    uint8_t op_code;
};
#endif
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
    uint32_t lastReconnectAttemptTime;
    const uint32_t RECONNECT_INTERVAL_MS = 10000;

    bool network_is_connected = false;

    AttraccessApiConfig _lastApiConfig;

    ConnectionState _state = INIT;
    void setState(ConnectionState state);

    esp_websocket_client_handle_t ws_client;

    static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);
    void processWebSocketEvent(esp_event_base_t base, int32_t event_id, void *event_data);

    Logger logger;
};