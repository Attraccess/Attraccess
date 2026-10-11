#include "websocket.hpp"
#include "../platform.hpp"
#include <cstring>

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

    // Publish before sending so even an immediate PONG can match the probe.
    // Do not hold the quality mutex across the send: IDF can synchronously
    // dispatch ERROR/DISCONNECTED, whose callbacks take this same mutex.
    uint32_t sentAtMs = millis();
    this->lastPongProbeTime = sentAtMs;
    this->pendingPongProbeTime = sentAtMs;
    this->pendingPongProbeToken = token;
    xSemaphoreGive(this->network_quality_mutex);

    int ret = esp_websocket_client_send_with_opcode(ws_client, WS_TRANSPORT_OPCODES_PING, payload, sizeof(payload), 0);
    bool probeSendFailed = ret != static_cast<int>(sizeof(payload));
    xSemaphoreTake(this->network_quality_mutex, portMAX_DELAY);
    if (probeSendFailed)
    {
        if (this->pendingPongProbeToken == token)
        {
            this->pendingPongProbeTime = 0;
        }
    }
    else
    {
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
