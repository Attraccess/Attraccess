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

void Websocket::publishNetworkQuality()
{
    uint32_t nowMs = millis();
    uint32_t inboundAgeMs = (this->lastInboundFrameTime == 0) ? 0 : nowMs - this->lastInboundFrameTime;
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

    State::setNetworkQualityState(quality, inboundAgeMs, reconnects, txDepth, queueFull, sendFailures, livenessTimeouts,
                                  lastPongRttMs, averagePongRttMs, pongRttTrendMs, pongTimeouts, pongProbeLossPercent,
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
