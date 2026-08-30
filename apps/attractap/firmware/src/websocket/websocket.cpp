#include "websocket.hpp"
#include <functional>
#include "platform.hpp"
#include "esp_heap_caps.h"
#include "esp_system.h"
#include "settings/kvstore.hpp"
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

void Websocket::updateInfoFromAppState()
{
    auto networkState = State::getNetworkState();
    this->network_is_connected = networkState.wifi_connected || networkState.ethernet_connected;
}

// Mirror the live connection / cert-sweep progress into State so the connecting
// screen can surface where the device is (and where it is stuck). Cheap enough
// to run every loop tick.
void Websocket::publishConnectionStatus()
{
    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();

    // Keep the configured server target fresh even before the first connect attempt.
    State::setWebsocketState(_state == CONNECTED, apiConfig.hostname, apiConfig.port, apiConfig.useSSL);

    // Cert sweep progress is only meaningful for SSL connections.
    if (apiConfig.useSSL)
    {
        State::setWebsocketCertProgress(
            std::string(this->_certManager.getCurrentCertName()),
            this->_certManager.getCurrentCertIndex(),
            this->_certManager.getCertCount(),
            this->_certManager.getRememberedFailureCount(),
            this->_certManager.isLocked());
    }
    else
    {
        State::setWebsocketCertProgress("", 0, 0, 0, false);
    }

    // Seconds until the next reconnect attempt (0 while connected or due now).
    int secondsUntilNext = 0;
    if (_state != CONNECTED && network_is_connected)
    {
        uint32_t elapsed = millis() - lastReconnectAttemptTime;
        if (elapsed < this->nextRetryDelayMs)
        {
            secondsUntilNext = (int)((this->nextRetryDelayMs - elapsed + 999) / 1000);
        }
    }
    State::setWebsocketNextAttemptSeconds(secondsUntilNext);
}

void Websocket::sendPongProbe(uint32_t nowMs)
{
    if (!this->network_quality_mutex || nowMs - this->lastPongProbeTime < this->PONG_PROBE_INTERVAL_MS)
    {
        return;
    }

    lockWsClient();
    if (!ws_client)
    {
        unlockWsClient();
        return;
    }

    xSemaphoreTake(this->network_quality_mutex, portMAX_DELAY);
    if (this->pendingPongProbeTime != 0 && nowMs - this->pendingPongProbeTime < this->PONG_PROBE_TIMEOUT_MS)
    {
        xSemaphoreGive(this->network_quality_mutex);
        unlockWsClient();
        return;
    }
    if (this->pendingPongProbeTime != 0)
    {
        // The application PING is independent from esp_websocket's keepalive, so
        // account for its timeout here rather than relying on a client error event.
        this->pongTimeoutEventTimes[this->pongTimeoutEventNextIndex] = nowMs;
        this->pongTimeoutEventNextIndex = (uint8_t)((this->pongTimeoutEventNextIndex + 1) % QUALITY_EVENT_SLOTS);
        this->pendingPongProbeTime = 0;
    }

    uint32_t token = this->pendingPongProbeToken + 1;
    uint8_t payload[sizeof(token)];
    memcpy(payload, &token, sizeof(token));

    // Hold the quality lock until the send completes so a prompt PONG cannot be
    // processed before its matching PING timestamp and token are published.
    uint32_t sentAtMs = millis();
    int ret = esp_websocket_client_send_with_opcode(ws_client, WS_TRANSPORT_OPCODES_PING, payload, sizeof(payload), 0);
    this->lastPongProbeTime = sentAtMs;
    bool probeSendFailed = ret != static_cast<int>(sizeof(payload));
    if (ret == static_cast<int>(sizeof(payload)))
    {
        this->pendingPongProbeTime = sentAtMs;
        this->pendingPongProbeToken = token;
        this->pongProbeSentEventTimes[this->pongProbeSentEventNextIndex] = sentAtMs;
        this->pongProbeSentEventNextIndex = (uint8_t)((this->pongProbeSentEventNextIndex + 1) % PONG_PROBE_EVENT_SLOTS);
    }
    xSemaphoreGive(this->network_quality_mutex);
    unlockWsClient();

    if (probeSendFailed)
    {
        recordNetworkQualityEvent(this->sendFailureEventTimes, this->sendFailureEventNextIndex);
    }
}

void Websocket::clearPendingPongProbe()
{
    if (!this->network_quality_mutex)
    {
        return;
    }

    xSemaphoreTake(this->network_quality_mutex, portMAX_DELAY);
    this->pendingPongProbeTime = 0;
    xSemaphoreGive(this->network_quality_mutex);
}

void Websocket::publishNetworkQuality()
{
    uint32_t nowMs = millis();
    bool hasInboundMessage = this->lastInboundFrameTime != 0;
    uint32_t inboundAgeMs = hasInboundMessage ? nowMs - this->lastInboundFrameTime : 0;
    uint8_t txDepth = this->tx_queue ? (uint8_t)uxQueueMessagesWaiting(this->tx_queue) : 0;
    uint8_t reconnects = 0;
    uint8_t queueFull = 0;
    uint8_t sendFailures = 0;
    uint8_t livenessTimeouts = 0;
    uint8_t pongTimeouts = 0;
    uint8_t pongProbesSent = 0;
    uint8_t pongProbeResponses = 0;
    bool pongProbePending = false;
    uint8_t missedHeartbeats = 0;
    uint32_t lastPongRttMs = 0;
    uint32_t averagePongRttMs = 0;
    int32_t pongRttTrendMs = 0;
    bool hasPongRttSample = false;
    if (this->network_quality_mutex)
    {
        xSemaphoreTake(this->network_quality_mutex, portMAX_DELAY);
        reconnects = countRecentNetworkQualityEvents(this->reconnectEventTimes, QUALITY_EVENT_SLOTS, nowMs);
        queueFull = countRecentNetworkQualityEvents(this->txQueueFullEventTimes, QUALITY_EVENT_SLOTS, nowMs);
        sendFailures = countRecentNetworkQualityEvents(this->sendFailureEventTimes, QUALITY_EVENT_SLOTS, nowMs);
        livenessTimeouts = countRecentNetworkQualityEvents(this->livenessTimeoutEventTimes, QUALITY_EVENT_SLOTS, nowMs);
        pongTimeouts = countRecentNetworkQualityEvents(this->pongTimeoutEventTimes, QUALITY_EVENT_SLOTS, nowMs);
        pongProbesSent = countRecentNetworkQualityEvents(this->pongProbeSentEventTimes, PONG_PROBE_EVENT_SLOTS, nowMs);
        pongProbeResponses = countRecentNetworkQualityEvents(this->pongProbeResponseEventTimes, PONG_PROBE_EVENT_SLOTS, nowMs);
        pongProbePending = this->pendingPongProbeTime != 0;
        missedHeartbeats = countRecentNetworkQualityEvents(this->missedHeartbeatEventTimes, QUALITY_EVENT_SLOTS, nowMs);
        lastPongRttMs = this->lastPongRttMs;
        averagePongRttMs = averageRecentPongRtt(nowMs);
        pongRttTrendMs = recentPongRttTrend(nowMs);
        hasPongRttSample = this->hasPongRttSample;
        xSemaphoreGive(this->network_quality_mutex);
    }

    uint8_t completedPongProbes = pongProbesSent - (pongProbePending && pongProbesSent > 0 ? 1 : 0);
    uint8_t pongProbeLossPercent = completedPongProbes == 0 || pongProbeResponses >= completedPongProbes
                                       ? 0
                                       : (uint8_t)(((completedPongProbes - pongProbeResponses) * 100) / completedPongProbes);
    State::NetworkQuality quality = State::NETWORK_QUALITY_GOOD;
    if (!this->network_is_connected || this->_state != CONNECTED)
    {
        quality = State::NETWORK_QUALITY_OFFLINE;
    }
    else if ((this->lastInboundFrameTime != 0 && inboundAgeMs >= this->INBOUND_DEGRADED_AFTER_MS) ||
             reconnects >= 2 ||
             queueFull > 0 ||
              sendFailures > 0 ||
              livenessTimeouts > 0 ||
              pongTimeouts > 0 ||
               (completedPongProbes >= 3 && pongProbeLossPercent >= this->PONG_PROBE_LOSS_DEGRADED_PERCENT) ||
               missedHeartbeats > 0 ||
              averagePongRttMs >= this->PONG_RTT_DEGRADED_AFTER_MS ||
              txDepth >= (TX_QUEUE_DEPTH / 2))
    {
        quality = State::NETWORK_QUALITY_DEGRADED;
    }

    State::setNetworkQualityState(quality, inboundAgeMs, hasInboundMessage, reconnects, txDepth, queueFull, sendFailures,
                                  livenessTimeouts, lastPongRttMs, averagePongRttMs, pongRttTrendMs,
                                  hasPongRttSample, pongTimeouts, pongProbeLossPercent, completedPongProbes > 0,
                                  missedHeartbeats);
}

void Websocket::recordNetworkQualityEvent(uint32_t *events, uint8_t &nextIndex)
{
    if (!this->network_quality_mutex)
    {
        return;
    }

    xSemaphoreTake(this->network_quality_mutex, portMAX_DELAY);
    events[nextIndex] = millis();
    nextIndex = (uint8_t)((nextIndex + 1) % QUALITY_EVENT_SLOTS);
    xSemaphoreGive(this->network_quality_mutex);
}

void Websocket::recordPongRtt(uint32_t rttMs, uint32_t nowMs)
{
    if (!this->network_quality_mutex)
    {
        return;
    }

    xSemaphoreTake(this->network_quality_mutex, portMAX_DELAY);
    this->lastPongRttMs = rttMs;
    this->hasPongRttSample = true;
    this->pongRttSamples[this->pongRttSampleNextIndex] = rttMs;
    this->pongRttSampleTimes[this->pongRttSampleNextIndex] = nowMs;
    this->pongRttSampleNextIndex = (uint8_t)((this->pongRttSampleNextIndex + 1) % QUALITY_EVENT_SLOTS);
    xSemaphoreGive(this->network_quality_mutex);
}

uint8_t Websocket::countRecentNetworkQualityEvents(const uint32_t *events, size_t eventSlots, uint32_t nowMs) const
{
    uint8_t count = 0;
    for (size_t i = 0; i < eventSlots; i++)
    {
        if (events[i] != 0 && nowMs - events[i] <= this->QUALITY_EVENT_WINDOW_MS)
        {
            count++;
        }
    }
    return count;
}

uint32_t Websocket::averageRecentPongRtt(uint32_t nowMs) const
{
    uint32_t total = 0;
    uint8_t count = 0;
    for (size_t i = 0; i < QUALITY_EVENT_SLOTS; i++)
    {
        if (this->pongRttSampleTimes[i] != 0 && nowMs - this->pongRttSampleTimes[i] <= this->QUALITY_EVENT_WINDOW_MS)
        {
            total += this->pongRttSamples[i];
            count++;
        }
    }
    return count == 0 ? 0 : total / count;
}

int32_t Websocket::recentPongRttTrend(uint32_t nowMs) const
{
    size_t oldestIndex = QUALITY_EVENT_SLOTS;
    size_t newestIndex = QUALITY_EVENT_SLOTS;
    for (size_t i = 0; i < QUALITY_EVENT_SLOTS; i++)
    {
        if (this->pongRttSampleTimes[i] == 0 || nowMs - this->pongRttSampleTimes[i] > this->QUALITY_EVENT_WINDOW_MS)
        {
            continue;
        }
        if (oldestIndex == QUALITY_EVENT_SLOTS || this->pongRttSampleTimes[i] < this->pongRttSampleTimes[oldestIndex])
        {
            oldestIndex = i;
        }
        if (newestIndex == QUALITY_EVENT_SLOTS || this->pongRttSampleTimes[i] > this->pongRttSampleTimes[newestIndex])
        {
            newestIndex = i;
        }
    }

    if (oldestIndex == QUALITY_EVENT_SLOTS || oldestIndex == newestIndex)
    {
        return 0;
    }
    return static_cast<int32_t>(this->pongRttSamples[newestIndex]) - static_cast<int32_t>(this->pongRttSamples[oldestIndex]);
}

void Websocket::connectWebSocket()
{
    // Runs on the ws_conn task only. Hold the lifecycle mutex for the whole
    // attempt so disableConnectionAttempts() cannot destroy the client handle
    // mid-connect.
    if (connect_lifecycle_mutex)
    {
        xSemaphoreTake(connect_lifecycle_mutex, portMAX_DELAY);
    }
    this->connectWebSocketLocked();
    if (connect_lifecycle_mutex)
    {
        xSemaphoreGive(connect_lifecycle_mutex);
    }
}

void Websocket::connectWebSocketLocked()
{
    if (!connectionAttemptsEnabled)
    {
        return;
    }

    if (!shouldReconnect())
    {
        return;
    }
    lastReconnectAttemptTime = millis();

    logger.info("connectWebSocket");

    if (!network_is_connected)
    {
        logger.info("connectWebSocket: network is not connected");
        setState(INIT);
        return;
    }

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();
    std::string serverHostname = apiConfig.hostname;
    uint16_t serverPort = apiConfig.port;

    if (serverHostname.empty() || serverPort == 0)
    {
        logger.error("connectWebSocket: serverHostname or serverPort is empty");
        setState(INIT);

        return;
    }

    const char *certPem = nullptr;
    int certIndex = -1;
    if (apiConfig.useSSL)
    {
        logger.info("connectWebSocket: using SSL");
        // A changed API address invalidates the locked certificate decision:
        // the lock only proves anything about the server it was made against.
        this->_certManager.ensureLockMatchesServer(serverHostname + ":" + std::to_string(serverPort));
        if (!this->_certManager.getCertificate(&certPem))
        {
            logger.error("Failed to get certificate");
            setState(INIT);
            return;
        }
        certIndex = this->_certManager.getCurrentCertIndex();
    }
    else
    {
        logger.info("connectWebSocket: non secure (no SSL)");
    }

    bool configMatchesClient =
        _lastApiConfig.hostname == apiConfig.hostname &&
        _lastApiConfig.port == apiConfig.port &&
        _lastApiConfig.useSSL == apiConfig.useSSL &&
        _clientCertIndex == certIndex;

    _lastApiConfig = apiConfig;
    setState(CONNECTING);

    lockWsClient();
    esp_websocket_client_handle_t existingClient = ws_client;
    unlockWsClient();

    if (existingClient && configMatchesClient)
    {
        logger.info("connectWebSocket: reusing existing client (stop+start)");
        esp_websocket_client_stop(existingClient);
        esp_err_t restartRet = esp_websocket_client_start(existingClient);
        if (restartRet == ESP_OK)
        {
            logger.info("connectWebSocket: WebSocket restarted");
            this->consecutiveConnectFailures = 0;
            return;
        }
        logger.error((std::string("Failed to restart WebSocket client: ") + esp_err_to_name(restartRet)).c_str());
    }

    lockWsClient();
    esp_websocket_client_handle_t oldClient = ws_client;
    ws_client = nullptr;
    unlockWsClient();
    if (oldClient)
    {
        esp_websocket_client_destroy(oldClient);
    }

    std::string protocol = (apiConfig.useSSL) ? "wss" : "ws";
    std::string wsUrl = protocol + "://" + serverHostname + ":" + std::to_string(serverPort) + "/api/attractap/websocket";
    logger.info(("Connecting to WebSocket: " + wsUrl).c_str());

    esp_websocket_client_config_t websocket_cfg = {};
    websocket_cfg.uri = wsUrl.c_str();
    websocket_cfg.port = serverPort;

    // Configure buffer sizes to prevent ENOBUFS errors
    // WebSocket event callbacks parse API payloads and invoke application
    // callbacks on this task. The 9.8 KB stack overflowed on the initial
    // resource-list payload after adding network-quality reporting.
    websocket_cfg.task_stack = 16384;
    websocket_cfg.buffer_size = 4096; // Increase buffer size (default is typically 1024)
    // Below the LVGL render task (prio 4): TLS work must not preempt UI refresh
    // (default was 5, unpinned) - ATT-554 item 7.
    websocket_cfg.task_prio = 3;

    websocket_cfg.ping_interval_sec = 5;
    websocket_cfg.pingpong_timeout_sec = PINGPONG_TIMEOUT_SEC;
    websocket_cfg.disable_pingpong_discon = false;
    // Bound unreachable-host retries: without network_timeout_ms the client
    // waits the full TCP connect timeout per attempt, which multiplies across
    // the cert sweep (PERFORMANCE_ANALYSIS.md quick win Q2).
    websocket_cfg.network_timeout_ms = 10000;

    websocket_cfg.disable_auto_reconnect = true;

    websocket_cfg.keep_alive_enable = true;
    websocket_cfg.keep_alive_idle = 5;
    websocket_cfg.keep_alive_interval = 5;
    websocket_cfg.keep_alive_count = 3;

    if (apiConfig.useSSL)
    {
        websocket_cfg.transport = WEBSOCKET_TRANSPORT_OVER_SSL;
        websocket_cfg.cert_pem = certPem;
    }

    _clientCertIndex = certIndex;

    esp_websocket_client_handle_t newClient = esp_websocket_client_init(&websocket_cfg);
    if (!newClient)
    {
        handleConnectFailure("esp_websocket_client_init returned null");
        return;
    }

    // Register event handler
    esp_websocket_register_events(newClient, WEBSOCKET_EVENT_ANY, websocket_event_handler, this);

    // Start connection
    esp_err_t ret = esp_websocket_client_start(newClient);
    if (ret != ESP_OK)
    {
        esp_websocket_client_destroy(newClient);
        handleConnectFailure((std::string("esp_websocket_client_start: ") + esp_err_to_name(ret)).c_str());
        return;
    }

    lockWsClient();
    ws_client = newClient;
    unlockWsClient();

    this->consecutiveConnectFailures = 0;
    logger.info("connectWebSocket: WebSocket started");
}

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

void Websocket::websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    Websocket *websocket = (Websocket *)handler_args;
    websocket->processWebSocketEvent(base, event_id, event_data);
}

void Websocket::processWebSocketEvent(esp_event_base_t base, int32_t event_id, void *event_data)
{
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;

    AttraccessApiConfig apiConfig = Settings::getAttraccessApiConfig();

    switch (event_id)
    {
    case WEBSOCKET_EVENT_CONNECTED:
        logger.info("WebSocket connected");
        this->lastInboundFrameTime = millis();
        this->consecutiveConnectFailures = 0;
        // Only an SSL connect proves anything about the certificate; locking on a
        // plain connect would pin index 0 and skip the sweep after a switch to SSL.
        if (apiConfig.useSSL)
        {
            this->_certManager.markSuccess(apiConfig.hostname + ":" + std::to_string(apiConfig.port));
        }
        resetReconnectBackoff();
        setState(CONNECTED);
        break;

    case WEBSOCKET_EVENT_CLOSED:
        logger.info("WebSocket closed");
        if (this->_state == CONNECTED || this->_state == CONNECTING)
        {
            recordNetworkQualityEvent(this->reconnectEventTimes, this->reconnectEventNextIndex);
        }
        setState(INIT);
        break;

    case WEBSOCKET_EVENT_DISCONNECTED:
    {
        logger.info("WebSocket disconnected");
        if (this->_state == CONNECTED || this->_state == CONNECTING)
        {
            recordNetworkQualityEvent(this->reconnectEventTimes, this->reconnectEventNextIndex);
        }
        if (apiConfig.useSSL && !this->_certManager.markFailure())
        {
            // Still iterating the certificate list: retry fast so a working cert near
            // the end of the list is reached within minutes, not hours.
            this->nextRetryDelayMs = this->CERT_ITERATION_INTERVAL_MS;
        }
        else
        {
            // A full certificate sweep failed (or non-SSL connect failed): the server
            // is likely unreachable, so back off exponentially to curb reconnect churn.
            growReconnectBackoff();
            this->nextRetryDelayMs = this->reconnectBackoffMs;
        }
        setState(INIT);
        break;
    }

    case WEBSOCKET_EVENT_DATA:
    {
        uint32_t nowMs = millis();
        if (data->op_code == WS_TRANSPORT_OPCODES_PONG && this->network_quality_mutex)
        {
            xSemaphoreTake(this->network_quality_mutex, portMAX_DELAY);
            if (this->pendingPongProbeTime != 0 &&
                data->data_len == static_cast<int>(sizeof(this->pendingPongProbeToken)) &&
                memcmp(data->data_ptr, &this->pendingPongProbeToken, sizeof(this->pendingPongProbeToken)) == 0)
            {
                uint32_t rttMs = nowMs - this->pendingPongProbeTime;
                this->pendingPongProbeTime = 0;
                this->pongProbeResponseEventTimes[this->pongProbeResponseEventNextIndex] = nowMs;
                this->pongProbeResponseEventNextIndex = (uint8_t)((this->pongProbeResponseEventNextIndex + 1) % PONG_PROBE_EVENT_SLOTS);
                xSemaphoreGive(this->network_quality_mutex);
                recordPongRtt(rttMs, nowMs);
            }
            else
            {
                xSemaphoreGive(this->network_quality_mutex);
            }
        }
        this->lastInboundFrameTime = nowMs;
        if (data->op_code == 0x01)
        { // Text frame
            if (this->messageCallbackRaw)
            {
                this->messageCallbackRaw((const char *)data->data_ptr, (size_t)data->data_len);
            }
        }
        else if (data->op_code == 0x02)
        { // Binary frame
            logger.debug(("Received binary data: " + std::to_string(data->data_len) + " bytes").c_str());

            if (this->binaryDataCallback)
            {
                this->binaryDataCallback(*data);
            }
        }
        break;
    }

    case WEBSOCKET_EVENT_ERROR:
        logger.error("WebSocket error");
        if (data && data->error_handle.error_type == WEBSOCKET_ERROR_TYPE_PONG_TIMEOUT)
        {
            recordNetworkQualityEvent(this->pongTimeoutEventTimes, this->pongTimeoutEventNextIndex);
        }
        if (this->_state == CONNECTED || this->_state == CONNECTING)
        {
            recordNetworkQualityEvent(this->reconnectEventTimes, this->reconnectEventNextIndex);
        }
        setState(INIT);
        break;

    default:
        // esp_websocket_client >=1.5.0 emits benign lifecycle events we don't act on
        // (BEFORE_CONNECT=5, BEGIN=6, FINISH=7). They are not errors, so keep them at
        // debug to avoid crying wolf in production (ERROR-only) log builds.
        logger.debugf("Unhandled websocket event: %d", (int)event_id);
        break;
    }
}

void Websocket::forceReconnect(const char *reason)
{
    logger.errorf("Forcing websocket reconnect: %s", reason);
    setState(INIT); // loop() initiates a fresh connection from INIT
}

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
