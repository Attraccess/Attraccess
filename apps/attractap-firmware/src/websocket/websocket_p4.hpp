#pragma once

#if defined(CONFIG_IDF_TARGET_ESP32P4)

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include "../settings/settings.hpp"
#include <functional>
#include "../state/state.hpp"
#include "../logger/logger.hpp"
#include "certManager/AdaptiveCertManager.hpp"

// Match esp_websocket_event_data_t layout for API compatibility
struct esp_websocket_event_data_t {
    void *data_ptr;
    int data_len;
    size_t payload_len;
    size_t payload_offset;
    uint8_t op_code;
};

class Websocket
{
public:
    Websocket() : logger("Websocket") {}

    enum ConnectionState
    {
        INIT,
        CONNECTING,
        CONNECTED,
    };
    void setup();
    void loop();
    void sendMessage(const String &message);
    void sendMessage(const char *message, size_t length);
    void setMessageCallbackRaw(std::function<void(const char *, size_t)> callback);
    void setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)> callback);

    void enableConnectionAttempts();
    void disableConnectionAttempts();

private:
    std::function<void(const char *, size_t)> messageCallbackRaw;
    std::function<void(esp_websocket_event_data_t)> binaryDataCallback;

    AdaptiveCertManager _certManager;

    bool connectionAttemptsEnabled = true;

    void updateInfoFromAppState();
    void connectWebSocket();
    void disconnect();
    void pollReceive();
    bool performHandshake();
    bool sendFrame(uint8_t opcode, const uint8_t *payload, size_t len);
    bool parseFrame();
    bool shouldReconnect();
    uint32_t lastReconnectAttemptTime;
    const uint32_t RECONNECT_INTERVAL_MS = 10000;

    bool network_is_connected = false;

    AttraccessApiConfig _lastApiConfig;

    ConnectionState _state = INIT;
    void setState(ConnectionState state);

    WiFiClient *tcpClient = nullptr;
    WiFiClientSecure *tcpClientSecure = nullptr;
    bool useSSL = false;

    static const size_t RX_BUF_SIZE = 4096;
    uint8_t rxBuf[RX_BUF_SIZE];
    size_t rxBufLen = 0;
    bool handshakeDone = false;

    Logger logger;
};

#endif // CONFIG_IDF_TARGET_ESP32P4
