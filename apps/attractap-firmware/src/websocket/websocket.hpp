#pragma once

#include <Arduino.h>
#include "esp_websocket_client.h"
#include "../settings/settings.hpp"
#include <functional>
#include "certManager/AdaptiveCertManager.hpp"

class Websocket
{
public:
    enum ConnectionState
    {
        INIT,
        CONNECTING,
        CONNECTED,
    };
    void setup();
    void setNetworkIsConnected(bool isConnected);

    void setStateChangedHandler(std::function<void(ConnectionState state)> stateChangedHandler);

    void setMessageHandler(std::function<void(const String &message)> messageHandler);
    void setBinaryDataHandler(std::function<void(const uint8_t *data, size_t length)> binaryDataHandler);

    void sendMessage(const String &message);

private:
    static void taskFn(void *parameter);
    void loop();

    AdaptiveCertManager _certManager;

    bool network_is_connected = false;
    const uint32_t RECONNECT_INTERVAL_MS = 10000;

    AttraccessApiConfig _lastApiConfig;

    std::function<void(ConnectionState state)> _stateChangedHandler;
    std::function<void(const String &message)> _messageHandler;
    std::function<void(const uint8_t *data, size_t length)> _binaryDataHandler;

    ConnectionState _state = INIT;
    void setState(ConnectionState state);

    void connectTCP();
    void connectWebSocket();

    esp_websocket_client_handle_t ws_client;

    static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);
    void processWebSocketEvent(esp_event_base_t base, int32_t event_id, void *event_data);
};