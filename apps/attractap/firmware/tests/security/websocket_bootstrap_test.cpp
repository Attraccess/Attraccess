// The real owner loop and TLS session run with controlled device IO and clock.
#include "websocket/websocket.hpp"
#include "esp_timer.h"

#include <cassert>
#include <iostream>
#include <vector>
static unsigned destroyed = 0, requests = 0, cancellations = 0;
static std::vector<std::vector<uint8_t>> challenges;
static ReaderSecurity::ReaderSession::Emit output;
static ReaderSecurity::ReaderSession::Deliver application;
extern void advance_reader_test_clock(int64_t);
Logger::Logger(const char *name) : name(name) {}
AdaptiveCertManager::AdaptiveCertManager() : logger("test") {}
AdaptiveCertManager::~AdaptiveCertManager() = default;
void KVStore::end() {}
void Websocket::setup() {}
bool Websocket::sendMessage(const char *, size_t) { return false; }
bool Websocket::sendHeartbeat(const char *, size_t) { return false; }
void Websocket::setMessageCallbackRaw(std::function<void(const char *, size_t)>) {}
void Websocket::setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)>) {}
void Websocket::enableConnectionAttempts() {}
void Websocket::disableConnectionAttempts() {}
void Websocket::forceReconnect(const char *) {}
void Websocket::resetCertificateTrust() {}
void Websocket::lockWsClient() {}
void Websocket::unlockWsClient() {}
void Websocket::drainTxQueue() { ++cancellations; }
void Websocket::setState(ConnectionState state) { _state = state; }
void Websocket::updateInfoFromAppState() {}
void Websocket::publishConnectionStatus() {}
void Websocket::publishNetworkQuality() {}
void Websocket::checkConnectWatchdog(const AttraccessApiConfig &) {}
void Websocket::logHeapStats() {}
void Websocket::growReconnectBackoff() { reconnectBackoffMs = std::min(reconnectBackoffMs * 2, RECONNECT_BACKOFF_MAX_MS); }
int esp_websocket_client_destroy(esp_websocket_client_handle_t) { ++destroyed; return 0; }
struct WebsocketBootstrapTest {
    static void connect(Websocket &ws) {
        ws._state = Websocket::CONNECTING;
        ws.ws_client = &ws;
        ws.securitySessionStarted = true;
        assert(ws.secured.begin([](const uint8_t *bytes, size_t size) {
            challenges.emplace_back(bytes, bytes + size); return output ? output(bytes, size) : true;
        }, [](uint8_t type, const uint8_t *bytes, size_t size) { if (application) application(type, bytes, size); }));
    }
    static ReaderSecurity::ReaderSession &start(Websocket &ws, ReaderSecurity::ReaderSession::Emit emit,
                                                ReaderSecurity::ReaderSession::Deliver deliver) {
        output = std::move(emit); application = std::move(deliver);
        ws.network_is_connected = true;
        ws._lastApiConfig = Settings::getAttraccessApiConfig();
        connect(ws);
        return ws.secured;
    }
    static void run() {
        Websocket ws;
        ws.network_is_connected = true;
        ws._lastApiConfig = Settings::getAttraccessApiConfig();
        ws._state = Websocket::CONNECTING;
        ws.loop();
        assert(ws._state == Websocket::CONNECTING && destroyed == 0);
        connect(ws);
        assert(challenges.size() == 1);
        advance_reader_test_clock(5000000);
        ws.loop();
        assert(ws._state == Websocket::INIT && ws.ws_client == nullptr);
        assert(destroyed == 1 && cancellations == 1 && ws.connectionGeneration == 1);
        assert(challenges.size() == 1); // Backoff prevents an immediate retry.
        advance_reader_test_clock(30000000);
        ws.loop();
        assert(challenges.size() == 2 && challenges[0] != challenges[1]);
        // A repeated outage also tears down, grows backoff, and starts fresh.
        advance_reader_test_clock(5000000);
        ws.loop();
        assert(destroyed == 2 && cancellations == 2);
        advance_reader_test_clock(30000000);
        ws.loop();
        assert(challenges.size() == 3 && challenges[1] != challenges[2]);
        assert(requests >= 3);
        std::cout << "WRAPPER_OK: silent time peer closes raw socket, cancels queued work, retries with fresh challenges and bounded backoff" << std::endl;
    }
    static void request(Websocket &ws) {
        ++requests;
        if (uint32_t(esp_timer_get_time() / 1000) - ws.lastReconnectAttemptTime < ws.nextRetryDelayMs) return;
        ws.lastReconnectAttemptTime = uint32_t(esp_timer_get_time() / 1000);
        connect(ws);
    }
};
void Websocket::requestConnect() { WebsocketBootstrapTest::request(*this); }
void run_websocket_bootstrap_test() { WebsocketBootstrapTest::run(); }

ReaderSecurity::ReaderSession &start_websocket_owner(Websocket &ws, ReaderSecurity::ReaderSession::Emit emit,
                                                   ReaderSecurity::ReaderSession::Deliver deliver) {
    return WebsocketBootstrapTest::start(ws, std::move(emit), std::move(deliver));
}
void retry_websocket_owner(Websocket &ws) {
    advance_reader_test_clock(5000000);
    ws.loop();
    advance_reader_test_clock(30000000);
    ws.loop();
}
