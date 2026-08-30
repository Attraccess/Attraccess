#pragma once

#include <string>
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
    bool sendMessage(const std::string &message);
    bool sendMessage(const char *message, size_t length);
    bool sendHeartbeat(const char *message, size_t length);
    void setMessageCallbackRaw(std::function<void(const char *, size_t)> callback);
    void setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)> callback);

    void enableConnectionAttempts();
    void disableConnectionAttempts();

    // Tear down the current connection and reconnect (same mechanism as the
    // inbound-liveness watchdog). Must be called from the main-loop task.
    void forceReconnect(const char *reason);

    // Clear the locked TLS certificate decision so the next connect sweeps the
    // full CA list again (device settings "reset certificate" button).
    void resetCertificateTrust();

private:
    std::function<void(const char *, size_t)> messageCallbackRaw;
    std::function<void(esp_websocket_event_data_t)> binaryDataCallback;

    AdaptiveCertManager _certManager;

    bool connectionAttemptsEnabled = true;

    void updateInfoFromAppState();
    void publishConnectionStatus();
    void publishNetworkQuality();
    void sendPongProbe(uint32_t nowMs);
    void clearPendingPongProbe();
    void recordNetworkQualityEvent(uint32_t *events, uint8_t &nextIndex);
    void recordPongRtt(uint32_t rttMs, uint32_t nowMs);
    uint8_t countRecentNetworkQualityEvents(const uint32_t *events, size_t eventSlots, uint32_t nowMs) const;
    uint32_t averageRecentPongRtt(uint32_t nowMs) const;
    int32_t recentPongRttTrend(uint32_t nowMs) const;
    void connectWebSocket();
    void connectWebSocketLocked();
    bool shouldReconnect();
    uint32_t lastReconnectAttemptTime = 0;

    // (Re)connects run on a dedicated low-priority task (ATT-554 item 7):
    // esp_websocket_client_stop()/start() block for up to the network timeout,
    // which used to stall the UI-driving main loop on every reconnect attempt.
    // loop() only signals the task via a task notification (coalescing).
    static constexpr uint32_t CONNECT_TASK_STACK = 8192;
    static constexpr UBaseType_t CONNECT_TASK_PRIORITY = 2;
    TaskHandle_t connect_task = nullptr;
    static void connectTaskEntry(void *arg);
    void connectTaskLoop();
    void requestConnect();
    // Serializes connectWebSocket (connect task) against the client teardown in
    // disableConnectionAttempts (main loop) so the client handle cannot be
    // destroyed mid-connect.
    SemaphoreHandle_t connect_lifecycle_mutex = nullptr;

    const uint32_t CERT_ITERATION_INTERVAL_MS = 10000;
    const uint32_t RECONNECT_BACKOFF_BASE_MS = 10000;
    const uint32_t RECONNECT_BACKOFF_MAX_MS = 60000;
    uint32_t reconnectBackoffMs = 10000;
    uint32_t nextRetryDelayMs = 10000;
    void growReconnectBackoff();
    void resetReconnectBackoff();

    uint32_t lastHeapLogTime = 0;
    const uint32_t HEAP_LOG_INTERVAL_MS = 30000;
    void logHeapStats();

    // Recovery from a fragmented internal heap: once esp_websocket_client_start()
    // can no longer carve out a contiguous block for its ~10 KB task stack it logs
    // "Error create websocket task" and returns ESP_FAIL on every attempt, leaving
    // the device permanently stuck on the connecting screen even after the server
    // returns. Repeated stop/start cycles during an outage are what fragments the
    // heap in the first place, and a reboot is the only reliable way to defragment
    // it. We count consecutive start failures (which only happen when the client
    // truly cannot be created, never during a normal refused connection) and reboot
    // once the threshold is hit to force a clean reconnect.
    uint8_t consecutiveConnectFailures = 0;
    static constexpr uint8_t MAX_CONSECUTIVE_CONNECT_FAILURES = 5;
    void handleConnectFailure(const char *reason);

    // Reboot when no connection could be established for this long even though
    // network and server config are present (ATT-714).
    static constexpr uint32_t CONNECT_WATCHDOG_TIMEOUT_MS = 90000;
    uint32_t connectWatchdogStartMs = 0; // 0 = not waiting
    // Cert index seen at the last watchdog check: an advancing sweep re-arms the
    // watchdog, since a full sweep (certs x attempts x retry interval) takes far
    // longer than one watchdog period and the sweep position only lives in RAM.
    int connectWatchdogCertIndex = 0;
    void checkConnectWatchdog(const AttraccessApiConfig &apiConfig);

    uint32_t lastInboundFrameTime = 0;
    const uint32_t INBOUND_DEGRADED_AFTER_MS = 12000;
    const uint32_t INBOUND_LIVENESS_TIMEOUT_MS = 20000;
    const uint32_t QUALITY_EVENT_WINDOW_MS = 60000;
    static constexpr size_t QUALITY_EVENT_SLOTS = 8;
    static constexpr size_t PONG_PROBE_EVENT_SLOTS = (60000 / 5000) + 1;
    // Event rings are written by the main loop, websocket callback, and TX task.
    SemaphoreHandle_t network_quality_mutex = nullptr;
    uint32_t reconnectEventTimes[QUALITY_EVENT_SLOTS] = {};
    uint32_t txQueueFullEventTimes[QUALITY_EVENT_SLOTS] = {};
    uint32_t sendFailureEventTimes[QUALITY_EVENT_SLOTS] = {};
    uint32_t livenessTimeoutEventTimes[QUALITY_EVENT_SLOTS] = {};
    uint32_t pongTimeoutEventTimes[QUALITY_EVENT_SLOTS] = {};
    uint32_t pongProbeSentEventTimes[PONG_PROBE_EVENT_SLOTS] = {};
    uint32_t pongProbeResponseEventTimes[PONG_PROBE_EVENT_SLOTS] = {};
    uint32_t missedHeartbeatEventTimes[QUALITY_EVENT_SLOTS] = {};
    uint32_t pongRttSampleTimes[QUALITY_EVENT_SLOTS] = {};
    uint32_t pongRttSamples[QUALITY_EVENT_SLOTS] = {};
    uint8_t reconnectEventNextIndex = 0;
    uint8_t txQueueFullEventNextIndex = 0;
    uint8_t sendFailureEventNextIndex = 0;
    uint8_t livenessTimeoutEventNextIndex = 0;
    uint8_t pongTimeoutEventNextIndex = 0;
    uint8_t pongProbeSentEventNextIndex = 0;
    uint8_t pongProbeResponseEventNextIndex = 0;
    uint8_t missedHeartbeatEventNextIndex = 0;
    uint8_t pongRttSampleNextIndex = 0;
    uint32_t lastPongRttMs = 0;
    bool hasPongRttSample = false;
    uint32_t lastPongProbeTime = 0;
    uint32_t pendingPongProbeTime = 0;
    uint32_t pendingPongProbeToken = 0;
    const uint32_t PONG_PROBE_INTERVAL_MS = 5000;
    const uint32_t PONG_PROBE_TIMEOUT_MS = 10000;
    const uint32_t PONG_RTT_DEGRADED_AFTER_MS = 1000;
    static constexpr uint8_t PONG_PROBE_LOSS_DEGRADED_PERCENT = 30;
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

    // Dedicated TX path: all sends are copied onto a queue and drained by a single
    // task so neither the main loopTask nor the WebSocket event task ever blocks on
    // the (up to 5s) socket send under a congested link, and sends never overlap.
    struct TxMessage
    {
        char *data;
        size_t length;
        bool isHeartbeat;
    };
    static constexpr size_t TX_QUEUE_DEPTH = 8;
    static constexpr uint32_t TX_TASK_STACK = 4096;
    // Below the LVGL render task (prio 4): the tx task must not preempt UI
    // refresh (PERFORMANCE_ANALYSIS.md quick win Q3). Was 5 (above render).
    static constexpr UBaseType_t TX_TASK_PRIORITY = 3;
    const TickType_t SEND_TIMEOUT_TICKS = pdMS_TO_TICKS(5000);
    QueueHandle_t tx_queue = nullptr;
    TaskHandle_t tx_task = nullptr;
    static void txTaskEntry(void *arg);
    void txTaskLoop();
    bool enqueueMessage(const char *data, size_t length, bool isHeartbeat = false);
    void drainTxQueue();

    static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data);
    void processWebSocketEvent(esp_event_base_t base, int32_t event_id, void *event_data);

    Logger logger;
};
