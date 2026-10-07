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
