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






void Websocket::forceReconnect(const char *reason)
{
    logger.errorf("Forcing websocket reconnect: %s", reason);
    setState(INIT); // loop() initiates a fresh connection from INIT
}
