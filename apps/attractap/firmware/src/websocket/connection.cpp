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

// Deliberate-reboot reason handed to the crash reporter across the SW reset (see
// api_diag.cpp). Lives in the same NVS namespace as the boot diagnostics record
// so the API layer can pick it up and attach it to the uploaded crash report.

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

// Deliberate-reboot reason handed to the crash reporter across the SW reset (see
// api_diag.cpp). Lives in the same NVS namespace as the boot diagnostics record
// so the API layer can pick it up and attach it to the uploaded crash report.

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
