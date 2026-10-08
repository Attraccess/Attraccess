#include "websocket.hpp"
#include <functional>
#include "../platform.hpp"
#include "esp_heap_caps.h"
#include "esp_system.h"
#include "../settings/kvstore.hpp"
#include <cstdlib>
#include <cstring>
#include <string>

// Deliberate-reboot reason handed to the crash reporter across the SW reset (see
// api_diag.cpp). Lives in the same NVS namespace as the boot diagnostics record
// so the API layer can pick it up and attach it to the uploaded crash report.
#define BOOT_DIAG_NAMESPACE "bootdiag"
#define BOOT_DIAG_REBOOT_REASON_KEY "rebootreason"

void Websocket::setup()
{
    logger.info("Websocket setup");
    if (!ws_client_mutex)
    {
        ws_client_mutex = xSemaphoreCreateMutex();
    }
    if (!connect_lifecycle_mutex)
    {
        connect_lifecycle_mutex = xSemaphoreCreateMutex();
    }
    if (!network_quality_mutex)
    {
        network_quality_mutex = xSemaphoreCreateMutex();
        if (!network_quality_mutex)
        {
            logger.error("Websocket setup: network quality mutex allocation failed; quality event tracking disabled");
        }
    }
    if (!tx_queue)
    {
        tx_queue = xQueueCreate(TX_QUEUE_DEPTH, sizeof(TxMessage));
    }
    if (!tx_task && tx_queue)
    {
        xTaskCreate(txTaskEntry, "ws_tx", TX_TASK_STACK, this, TX_TASK_PRIORITY, &tx_task);
    }
    if (!connect_task)
    {
        xTaskCreate(connectTaskEntry, "ws_conn", CONNECT_TASK_STACK, this, CONNECT_TASK_PRIORITY, &connect_task);
    }
    this->_certManager.begin();
}

void Websocket::connectTaskEntry(void *arg)
{
    static_cast<Websocket *>(arg)->connectTaskLoop();
}

void Websocket::connectTaskLoop()
{
    while (true)
    {
        // Block until loop() requests a (re)connect; multiple requests coalesce.
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
        this->connectWebSocket();
    }
}

void Websocket::requestConnect()
{
    if (connect_task)
    {
        xTaskNotifyGive(connect_task);
    }
}

void Websocket::lockWsClient()
{
    if (ws_client_mutex)
    {
        xSemaphoreTake(ws_client_mutex, portMAX_DELAY);
    }
}

void Websocket::unlockWsClient()
{
    if (ws_client_mutex)
    {
        xSemaphoreGive(ws_client_mutex);
    }
}

void Websocket::loop()
{
    uint32_t nowMs = millis();
    if (nowMs - this->lastHeapLogTime >= this->HEAP_LOG_INTERVAL_MS)
    {
        this->lastHeapLogTime = nowMs;
        this->logHeapStats();
    }

    if (!connectionAttemptsEnabled)
    {
        this->connectWatchdogStartMs = 0;
        return;
    }

    this->updateInfoFromAppState();
    this->publishConnectionStatus();
    this->publishNetworkQuality();

    if (!network_is_connected)
    {
        this->connectWatchdogStartMs = 0;
        return;
    }

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();
    this->checkConnectWatchdog(apiConfig);
    bool apiConfigChanged = _lastApiConfig.hostname != apiConfig.hostname || _lastApiConfig.port != apiConfig.port || _lastApiConfig.useSSL != apiConfig.useSSL;
    if (apiConfigChanged)
    {
        requestConnect();
        return;
    }

    switch (_state)
    {
    case INIT:
        requestConnect();
        break;
    case CONNECTING:
        break;
    case CONNECTED:
        sendPongProbe(nowMs);
        if (millis() - this->lastInboundFrameTime > this->INBOUND_LIVENESS_TIMEOUT_MS)
        {
            logger.error("No inbound frames within liveness timeout, forcing reconnect");
            recordNetworkQualityEvent(this->livenessTimeoutEventTimes, this->livenessTimeoutEventNextIndex);
            setState(INIT);
        }
        break;
    }
}

void Websocket::forceReconnect(const char *reason)
{
    logger.errorf("Forcing websocket reconnect: %s", reason);
    setState(INIT); // loop() initiates a fresh connection from INIT
}

// Deliberate-reboot reason handed to the crash reporter across the SW reset (see
// api_diag.cpp). Lives in the same NVS namespace as the boot diagnostics record
// so the API layer can pick it up and attach it to the uploaded crash report.

void Websocket::setState(ConnectionState state)
{
    if (this->_state == CONNECTED && state != CONNECTED)
    {
        // A PONG from the old socket must not time out after a new socket connects.
        clearPendingPongProbe();
    }
    _state = state;

    State::WebsocketPhase phase = State::WS_INIT;
    switch (state)
    {
    case CONNECTING:
        phase = State::WS_CONNECTING;
        break;
    case CONNECTED:
        phase = State::WS_CONNECTED;
        break;
    case INIT:
    default:
        phase = State::WS_INIT;
        break;
    }
    State::setWebsocketPhase(phase);

    State::setWebsocketState(state == CONNECTED, this->_lastApiConfig.hostname, this->_lastApiConfig.port, this->_lastApiConfig.useSSL);
}

void Websocket::setMessageCallbackRaw(std::function<void(const char *, size_t)> callback)
{
    this->messageCallbackRaw = callback;
}

void Websocket::setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)> callback)
{
    this->binaryDataCallback = callback;
}

void Websocket::enableConnectionAttempts()
{
    this->connectionAttemptsEnabled = true;
}

void Websocket::disableConnectionAttempts()
{
    this->connectionAttemptsEnabled = false;

    // Wait for any in-flight connect attempt on the ws_conn task to finish
    // before tearing the client down (it re-checks connectionAttemptsEnabled
    // under this mutex, so no new attempt can start).
    if (connect_lifecycle_mutex)
    {
        xSemaphoreTake(connect_lifecycle_mutex, portMAX_DELAY);
    }

    lockWsClient();
    esp_websocket_client_handle_t oldClient = ws_client;
    ws_client = nullptr;
    unlockWsClient();
    if (oldClient)
    {
        esp_websocket_client_destroy(oldClient);
    }

    if (connect_lifecycle_mutex)
    {
        xSemaphoreGive(connect_lifecycle_mutex);
    }

    drainTxQueue();

    setState(INIT);
}

// Deliberate-reboot reason handed to the crash reporter across the SW reset (see
// api_diag.cpp). Lives in the same NVS namespace as the boot diagnostics record
// so the API layer can pick it up and attach it to the uploaded crash report.

// A failed (re)connect that gets this far means the websocket client could not be
// created/started at all -- almost always because the internal heap is too
// fragmented to allocate the client task's stack ("Error create websocket task" /
// ESP_FAIL from the IDF). That state does not heal on its own: every subsequent
// attempt fails the same way and the device sits forever on the connecting screen.
// Reboot after a few consecutive failures so the heap is defragmented and the
// device reconnects cleanly once the server is reachable again.
void Websocket::handleConnectFailure(const char *reason)
{
    this->consecutiveConnectFailures++;
    this->logger.errorf("Failed to start WebSocket client (%s); consecutive=%u heap_free=%u heap_largest=%u",
                        reason,
                        (unsigned)this->consecutiveConnectFailures,
                        (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                        (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL));
    setState(INIT);

    if (this->consecutiveConnectFailures >= MAX_CONSECUTIVE_CONNECT_FAILURES)
    {
        this->logger.error("WebSocket client could not be started repeatedly (heap likely fragmented); rebooting to recover");

        // Record why we are rebooting so the next boot's crash report carries the
        // real cause instead of a bare "SW" reset reason. The API layer reads and
        // clears this key once the report is acknowledged (see api_diag.cpp).
        KVStore prefs;
        if (prefs.begin(BOOT_DIAG_NAMESPACE, false))
        {
            prefs.putString(BOOT_DIAG_REBOOT_REASON_KEY, "WEBSOCKET_RECONNECT_HEAP_EXHAUSTION");
            prefs.end();
        }

        delay(200);
        esp_restart();
    }
}

// Last line of defense against any connect-loop the device cannot escape on its
// own (wedged TLS stack, exhausted socket state, ...): if network and server
// config are present but no connection could be established for a whole
// watchdog period, reboot into a clean slate. An advancing certificate sweep
// re-arms the watchdog: the sweep position is RAM-only and a full sweep takes
// longer than one watchdog period, so rebooting mid-sweep would restart it at
// index 0 forever and certs late in the list would never be reached. Only a
// locked certificate (index frozen) or a truly stuck attempt lets it fire.
void Websocket::checkConnectWatchdog(const AttraccessApiConfig &apiConfig)
{
    bool waitingForConnection = _state != CONNECTED && !apiConfig.hostname.empty() && apiConfig.port != 0;
    if (!waitingForConnection)
    {
        this->connectWatchdogStartMs = 0;
        return;
    }

    uint32_t now = millis();
    int certIndex = this->_certManager.getCurrentCertIndex();
    bool sweepAdvanced = certIndex != this->connectWatchdogCertIndex;
    this->connectWatchdogCertIndex = certIndex;

    if (this->connectWatchdogStartMs == 0 || sweepAdvanced)
    {
        this->connectWatchdogStartMs = now ? now : 1;
        return;
    }

    if (now - this->connectWatchdogStartMs < CONNECT_WATCHDOG_TIMEOUT_MS)
    {
        return;
    }

    this->logger.errorf("No connection for %u ms despite network and config; rebooting to recover",
                        (unsigned)CONNECT_WATCHDOG_TIMEOUT_MS);

    // Same mechanism as handleConnectFailure: leave the reboot cause for the
    // next boot's crash report (read and cleared by api_diag.cpp).
    KVStore prefs;
    if (prefs.begin(BOOT_DIAG_NAMESPACE, false))
    {
        prefs.putString(BOOT_DIAG_REBOOT_REASON_KEY, "WEBSOCKET_CONNECT_TIMEOUT");
        prefs.end();
    }

    delay(200);
    esp_restart();
}

void Websocket::resetCertificateTrust()
{
    this->_certManager.reset();
}

bool Websocket::shouldReconnect()
{
    return millis() - this->lastReconnectAttemptTime >= this->nextRetryDelayMs;
}

void Websocket::growReconnectBackoff()
{
    uint32_t next = this->reconnectBackoffMs * 2;
    this->reconnectBackoffMs = (next > this->RECONNECT_BACKOFF_MAX_MS) ? this->RECONNECT_BACKOFF_MAX_MS : next;
}

void Websocket::resetReconnectBackoff()
{
    this->reconnectBackoffMs = this->RECONNECT_BACKOFF_BASE_MS;
    this->nextRetryDelayMs = this->RECONNECT_BACKOFF_BASE_MS;
}

void Websocket::logHeapStats()
{
    this->logger.infof("Heap internal: free=%u largest=%u",
                       (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
                       (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL));
}

// Deliberate-reboot reason handed to the crash reporter across the SW reset (see
// api_diag.cpp). Lives in the same NVS namespace as the boot diagnostics record
// so the API layer can pick it up and attach it to the uploaded crash report.

bool Websocket::sendMessage(const std::string &message)
{
    this->logger.debug(("sendMessage: " + message).c_str());
    return enqueueMessage(message.c_str(), message.length());
}

bool Websocket::sendMessage(const char *message, size_t length)
{
    return enqueueMessage(message, length);
}

bool Websocket::sendHeartbeat(const char *message, size_t length)
{
    return enqueueMessage(message, length, true);
}

bool Websocket::enqueueMessage(const char *data, size_t length, bool isHeartbeat)
{
    if (!tx_queue)
    {
        logger.error("enqueueMessage: tx_queue not initialized");
        return false;
    }

    char *copy = (char *)malloc(length);
    if (!copy)
    {
        logger.error("enqueueMessage: allocation failed");
        return false;
    }
    memcpy(copy, data, length);

    TxMessage msg{copy, length, isHeartbeat};
    if (xQueueSend(tx_queue, &msg, 0) != pdTRUE)
    {
        logger.error("enqueueMessage: tx queue full, dropping message");
        recordNetworkQualityEvent(this->txQueueFullEventTimes, this->txQueueFullEventNextIndex);
        if (isHeartbeat)
        {
            recordNetworkQualityEvent(this->missedHeartbeatEventTimes, this->missedHeartbeatEventNextIndex);
        }
        free(copy);
        return false;
    }
    return true;
}

void Websocket::txTaskEntry(void *arg)
{
    static_cast<Websocket *>(arg)->txTaskLoop();
}

void Websocket::txTaskLoop()
{
    TxMessage msg;
    while (true)
    {
        if (xQueueReceive(tx_queue, &msg, portMAX_DELAY) != pdTRUE)
        {
            continue;
        }

        lockWsClient();
        if (!ws_client)
        {
            unlockWsClient();
            logger.error("ws tx: ws_client not initialized, dropping message");
            if (msg.isHeartbeat)
            {
                recordNetworkQualityEvent(this->missedHeartbeatEventTimes, this->missedHeartbeatEventNextIndex);
            }
            free(msg.data);
            continue;
        }
        int ret = esp_websocket_client_send_text(ws_client, msg.data, static_cast<int>(msg.length), SEND_TIMEOUT_TICKS);
        unlockWsClient();

        if (ret == -1)
        {
            logger.error("ws tx: send failed");
            recordNetworkQualityEvent(this->sendFailureEventTimes, this->sendFailureEventNextIndex);
            if (msg.isHeartbeat)
            {
                recordNetworkQualityEvent(this->missedHeartbeatEventTimes, this->missedHeartbeatEventNextIndex);
            }
        }
        free(msg.data);
    }
}

void Websocket::drainTxQueue()
{
    if (!tx_queue)
    {
        return;
    }
    TxMessage msg;
    while (xQueueReceive(tx_queue, &msg, 0) == pdTRUE)
    {
        free(msg.data);
    }
}
