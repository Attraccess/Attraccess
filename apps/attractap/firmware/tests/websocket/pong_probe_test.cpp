#include "websocket/websocket.hpp"
#include <cstring>
#include <iostream>
#include <stdexcept>

// IDF dispatches ERROR/DISCONNECTED synchronously inside a failed send. A
// nonrecursive FreeRTOS mutex would wait forever; fail immediately in the shim.
int xSemaphoreTake(SemaphoreHandle_t mutex, TickType_t)
{
    if (mutex->locked) throw std::runtime_error("deadlock: synchronous send callback reacquired quality mutex");
    mutex->locked = true;
    return 1;
}
int xSemaphoreGive(SemaphoreHandle_t mutex) { mutex->locked = false; return 1; }
int64_t esp_timer_get_time() { return 10000000; }
void vTaskDelay(TickType_t) {}
static std::function<int(const uint8_t *, int)> onSend;
int esp_websocket_client_send_with_opcode(esp_websocket_client_handle_t, ws_transport_opcodes_t, const uint8_t *data, int len, TickType_t)
{
    return onSend(data, len);
}

// Only the ping implementation is under test. These collaborators do no I/O.
Logger::Logger(const char *name) : name(name) {}
AdaptiveCertManager::AdaptiveCertManager() : logger("test") {}
AdaptiveCertManager::~AdaptiveCertManager() = default;
void KVStore::end() {}
void Websocket::setup() {}
void Websocket::loop() {}
bool Websocket::sendMessage(const char *, size_t) { return true; }
bool Websocket::sendHeartbeat(const char *, size_t) { return true; }
void Websocket::setMessageCallbackRaw(std::function<void(const char *, size_t)>) {}
void Websocket::setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)>) {}
void Websocket::enableConnectionAttempts() {}
void Websocket::disableConnectionAttempts() {}
void Websocket::forceReconnect(const char *) {}
void Websocket::resetCertificateTrust() {}
void Websocket::lockWsClient() { xSemaphoreTake(ws_client_mutex, portMAX_DELAY); }
void Websocket::unlockWsClient() { xSemaphoreGive(ws_client_mutex); }
void Websocket::recordNetworkQualityEvent(uint32_t *events, uint8_t &index)
{
    xSemaphoreTake(network_quality_mutex, portMAX_DELAY);
    events[index++] = 10000;
    xSemaphoreGive(network_quality_mutex);
}
static void require(bool condition, const char *message)
{
    if (!condition) throw std::runtime_error(message);
}
struct WebsocketPongProbeTest
{
    static void run()
    {
        TestMutex quality, client;
        Websocket ws;
        ws.network_quality_mutex = &quality;
        ws.ws_client_mutex = &client;
        ws.ws_client = &ws;
        onSend = [&](const uint8_t *, int) {
            // Same call made by setState(INIT) in the synchronous error callback.
            ws.clearPendingPongProbe();
            return -1;
        };
        ws.sendPongProbe(10000);
        require(ws.pendingPongProbeTime == 0, "failed send left a pending probe");
        require(ws.sendFailureEventNextIndex == 1, "send failure was not counted");
        require(!quality.locked && !client.locked, "send failure leaked a lock");

        ws.lastPongProbeTime = 0;
        onSend = [&](const uint8_t *data, int len) {
            // A PONG may arrive before send returns: token/time must already be
            // visible and the callback must be able to take the quality mutex.
            xSemaphoreTake(&quality, portMAX_DELAY);
            require(ws.pendingPongProbeTime != 0, "PONG arrived before timestamp was published");
            require(len == sizeof(uint32_t) && std::memcmp(data, &ws.pendingPongProbeToken, len) == 0, "PONG token was not published");
            ws.pendingPongProbeTime = 0;
            xSemaphoreGive(&quality);
            return len;
        };
        ws.sendPongProbe(10000);
        require(ws.pendingPongProbeTime == 0, "completed PONG was rearmed after send");
        require(ws.pongProbeSentEventNextIndex == 1, "successful probe was not counted");
        require(!quality.locked && !client.locked, "successful send leaked a lock");
    }
};
int main()
{
    try { WebsocketPongProbeTest::run(); }
    catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
    std::cout << "Synchronous failure and immediate PONG both complete without deadlock\n";
}
