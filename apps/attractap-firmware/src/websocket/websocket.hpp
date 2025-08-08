#pragma once

#include <Arduino.h>
#include "esp_websocket_client.h"
#include "../settings/settings.hpp"
#include <functional>
#include "certManager/AdaptiveCertManager.hpp"
#include "task_priorities.h"
#include "../state/state.hpp"
#include "../logger/logger.hpp"

class Websocket
{
public:
    Websocket() : logger("Websocket"), lastKnownAppStateChangeTime(0) {}

    enum ConnectionState
    {
        INIT,
        CONNECTING,
        CONNECTED,
    };
    void setup();

    void connectWebSocket();

private:
    static void taskFn(void *parameter);
    void loop();

    void updateInfoFromAppState();
    uint32_t lastKnownAppStateChangeTime;

    void processOutgoingMessages();

    AdaptiveCertManager _certManager;

    bool network_is_connected = false;
    const uint32_t RECONNECT_INTERVAL_MS = 10000;

    AttraccessApiConfig _lastApiConfig;

    ConnectionState _state = INIT;
    void setState(ConnectionState state);

    void connectTCP();

    esp_websocket_client_handle_t ws_client;

    static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);
    void processWebSocketEvent(esp_event_base_t base, int32_t event_id, void *event_data);

    Logger logger;
};