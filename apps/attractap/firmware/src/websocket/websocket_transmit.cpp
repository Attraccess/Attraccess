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
