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
