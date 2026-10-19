#include "websocket.hpp"
#include "../platform.hpp"

void Websocket::loop()
{
#ifdef ATTRACTAP_PRODUCTION
    this->secured.tick();
    if (reconnectRequested.exchange(false) || (securitySessionStarted.load() && (_state == CONNECTING || _state == CONNECTED) && secured.failed()))
    {
        secured.close();
        securitySessionStarted = false;
        if (disconnectCallback) disconnectCallback();
        connectionGeneration++;
        drainTxQueue();
        // Serialize teardown with the connection task and detach the handle
        // before destroy can deliver callbacks from the failed generation.
        if (connect_lifecycle_mutex) xSemaphoreTake(connect_lifecycle_mutex, portMAX_DELAY);
        lockWsClient();
        auto *oldClient = ws_client;
        ws_client = nullptr;
        unlockWsClient();
        if (oldClient) esp_websocket_client_destroy(oldClient);
        if (connect_lifecycle_mutex) xSemaphoreGive(connect_lifecycle_mutex);
        nextRetryDelayMs = reconnectBackoffMs;
        growReconnectBackoff();
        lastReconnectAttemptTime = millis();
        setState(INIT);
    }
#endif
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
#ifndef ATTRACTAP_PRODUCTION
        sendPongProbe(nowMs);
        if (millis() - this->lastInboundFrameTime > this->INBOUND_LIVENESS_TIMEOUT_MS)
        {
            logger.error("No inbound frames within liveness timeout, forcing reconnect");
            recordNetworkQualityEvent(this->livenessTimeoutEventTimes, this->livenessTimeoutEventNextIndex);
            setState(INIT);
        }
#endif
        break;
    }
}
