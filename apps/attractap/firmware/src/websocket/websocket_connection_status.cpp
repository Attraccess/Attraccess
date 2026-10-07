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
