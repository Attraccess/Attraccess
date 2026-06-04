#pragma once

#include <Arduino.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/queue.h"
#include "freertos/task.h"
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
    uint32_t lastReconnectAttemptTime;
    const uint32_t RECONNECT_INTERVAL_MS = 10000;

    uint32_t lastInboundFrameTime = 0;
    const uint32_t INBOUND_LIVENESS_TIMEOUT_MS = 20000;
    const int PINGPONG_TIMEOUT_SEC = 10;

    bool network_is_connected = false;

    AttraccessApiConfig _lastApiConfig;

    ConnectionState _state = INIT;
    void setState(ConnectionState state);

    esp_websocket_client_handle_t ws_client = nullptr;
    SemaphoreHandle_t ws_client_mutex = nullptr;
    void lockWsClient();
    void unlockWsClient();

    // Dedicated TX path: all sends are copied onto a queue and drained by a single
    // task so neither the main loopTask nor the WebSocket event task ever blocks on
    // the (up to 5s) socket send under a congested link, and sends never overlap.
    struct TxMessage
    {
        char *data;
        size_t length;
    };
    static constexpr size_t TX_QUEUE_DEPTH = 8;
    static constexpr uint32_t TX_TASK_STACK = 4096;
    static constexpr UBaseType_t TX_TASK_PRIORITY = 5;
    const TickType_t SEND_TIMEOUT_TICKS = pdMS_TO_TICKS(5000);
    QueueHandle_t tx_queue = nullptr;
    TaskHandle_t tx_task = nullptr;
    static void txTaskEntry(void *arg);
    void txTaskLoop();
    void enqueueMessage(const char *data, size_t length);
    void drainTxQueue();

    static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);
    void processWebSocketEvent(esp_event_base_t base, int32_t event_id, void *event_data);

    Logger logger;
};