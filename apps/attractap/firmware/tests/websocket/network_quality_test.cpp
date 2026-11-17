#include "websocket/websocket.hpp"
#include <iostream>
#include <stdexcept>

// Only the network quality snapshot is under test: State keeps the last published one, the clock is set by hand.
int xSemaphoreTake(SemaphoreHandle_t mutex, TickType_t) { mutex->locked = true; return 1; }
int xSemaphoreGive(SemaphoreHandle_t mutex) { mutex->locked = false; return 1; }
static int64_t nowUs = 0;
int64_t esp_timer_get_time() { return nowUs; }
void vTaskDelay(TickType_t) {}
UBaseType_t uxQueueMessagesWaiting(QueueHandle_t) { return 0; }
static State::NetworkQualityState published;
void State::setNetworkQualityState(const NetworkQualityState &state) { published = state; }

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
void Websocket::setSubprotocol(const std::string &) {}
bool Websocket::sendBinary(const uint8_t *, size_t) { return true; }
void Websocket::setRawBinaryCallback(std::function<bool(const uint8_t *, size_t)>) {}
void Websocket::setConnectionCallback(std::function<void(bool)>) {}
static void require(bool condition, const char *message)
{
    if (!condition) throw std::runtime_error(message);
}
struct WebsocketNetworkQualityTest
{
    static void publishAt(Websocket &ws, uint32_t ms)
    {
        nowUs = int64_t(ms) * 1000;
        ws.publishNetworkQuality();
    }
    static void run()
    {
        TestMutex quality;
        Websocket ws;
        ws.network_quality_mutex = &quality;
        ws.network_is_connected = true;
        ws._state = Websocket::CONNECTED;

        publishAt(ws, 100000);
        require(!published.hasInboundMessage && !published.hasPongRttSample && !published.hasRecentPongRttSample &&
                    !published.hasCompletedPongProbe,
                "nothing measured yet, but a flag is set");

        ws.lastInboundFrameTime = 99000;
        ws.recordPongRtt(40, 100000);
        publishAt(ws, 100000);
        require(published.hasInboundMessage && published.lastInboundAgeMs == 1000, "inbound age not published");
        require(published.hasPongRttSample && published.hasRecentPongRttSample, "ping sample not flagged");
        require(published.averagePongRttMs == 40, "ping average not published");

        // A frame stamped after the clock was read is fresh, not 49 days old.
        ws.lastInboundFrameTime = 100005;
        publishAt(ws, 100000);
        require(published.lastInboundAgeMs == 0 && published.quality == State::NETWORK_QUALITY_GOOD,
                "a frame newer than the clock wrapped the inbound age");

        // A minute later the sample left the window: the latest ping stays, average and trend have nothing.
        ws.lastInboundFrameTime = 170000;
        publishAt(ws, 170000);
        require(published.hasPongRttSample && !published.hasRecentPongRttSample, "stale sample still counted as recent");

        // One probe in flight is not completed; an answered one is.
        ws.recordNetworkQualityEvent(ws.pongProbeSentEventTimes, ws.pongProbeSentEventNextIndex);
        ws.pendingPongProbeTime = 170000;
        publishAt(ws, 170000);
        require(!published.hasCompletedPongProbe, "pending probe counted as completed");
        ws.pendingPongProbeTime = 0;
        publishAt(ws, 170000);
        require(published.hasCompletedPongProbe, "finished probe not counted");
    }
};
int main()
{
    try { WebsocketNetworkQualityTest::run(); }
    catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
    std::cout << "Network quality flags follow the measurements\n";
}
