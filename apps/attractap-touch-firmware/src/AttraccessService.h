#ifndef ATTRACCESS_SERVICE_H
#define ATTRACCESS_SERVICE_H

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <PicoWebsocket.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "MainScreenUI.h"
#include <functional>
#include "nfc.hpp"
#include "flashz-http.hpp"

class AttraccessService
{
public:
    enum ConnectionState
    {
        DISCONNECTED,
        CONNECTING_TCP,
        CONNECTING_WEBSOCKET,
        CONNECTED,
        AUTHENTICATING,
        AUTHENTICATED,
        ERROR_FAILED,
        ERROR_TIMED_OUT,
        ERROR_INVALID_SERVER
    };

    // Connection state change callback
    typedef void (*ConnectionStateCallback)(ConnectionState state, const String &message);

    // Main content callback (replaces error/card checking callbacks)
    typedef void (*MainContentCallback)(const MainScreenUI::MainContent &content);

    typedef std::function<void(const String &label, const JsonArray &options)> SelectItemCallback;
    void setSelectItemCallback(SelectItemCallback cb);

    AttraccessService();
    ~AttraccessService();

    void begin();
    void update();

    // Connection management
    bool connect();
    void disconnect();
    bool isConnected();
    bool isAuthenticated();
    ConnectionState getConnectionState() const { return currentState; }
    String getConnectionStateString() const;
    String getReaderName() const { return readerName; }

    // Configuration
    void setServerConfig(const String &hostname, uint16_t port);
    bool hasValidConfig() const;

    // Authentication
    bool sendMessage(const String &eventType, const JsonObject &data);
    void registerDevice();

    // Callbacks
    void setConnectionStateCallback(ConnectionStateCallback callback) { stateCallback = callback; }
    void setMainContentCallback(MainContentCallback cb) { mainContentCallback = cb; }

    void onNFCTapped(const uint8_t *uid, uint8_t uidLength);

    void setNFC(NFC *nfc);

    void setCurrentIP(IPAddress ip);
    String getHostname();
    uint16_t getPort();
    String getDeviceId();

private:
    FlashZhttp fz;
    NFC *nfc = nullptr;
    std::function<void()> enableCardCheckingCallback;
    std::function<void()> disableCardCheckingCallback;
    // Core components
    WiFiClient tcpClient;
    PicoWebsocket::Client wsClient;
    Preferences preferences;

    IPAddress currentIp;

    // Configuration
    String serverHostname;
    uint16_t serverPort;
    bool configValid;

    // Connection state
    ConnectionState currentState;
    bool connecting;
    bool authenticated;
    String deviceId;
    String authToken;
    String readerName;

    // Timing
    uint32_t lastConnectionAttempt;
    uint32_t lastHeartbeat;
    uint32_t lastStateChange;
    static const uint32_t CONNECTION_RETRY_INTERVAL = 5000; // 5 seconds
    static const uint32_t HEARTBEAT_INTERVAL = 25000;       // 25 seconds (server timeout is 30s)
    static const uint32_t CONNECTION_TIMEOUT = 10000;       // 10 seconds

    // Callbacks
    ConnectionStateCallback stateCallback;
    MainContentCallback mainContentCallback;
    SelectItemCallback selectItemCallback;

    // Private methods
    bool checkTCPConnection();
    bool establishWebSocketConnection();
    void handleWebSocketMessage(const String &message);
    void sendHeartbeat();
    void loadCredentials();
    void saveCredentials();
    void setState(ConnectionState newState, const String &message = "");
    void handleAuthentication(const JsonObject &data);
    void handleRegistration(const JsonObject &data);

    // Message handling
    void processIncomingMessage(const String &message);
    bool sendJSONMessage(const JsonObject &messageObj);

    // --- New event/type handler helpers ---
    void handleResponseEvent(const String &type, const JsonObject &data);
    void handleEventType(const String &type, const JsonObject &data);
    void handleHeartbeatEvent();
    void handleUnauthorizedEvent();
    void handleDisplayErrorEvent(const JsonObject &data);
    void handleDisplaySuccessEvent(const JsonObject &data);
    void handleEnableCardCheckingEvent(const JsonObject &data);
    void handleDisableCardCheckingEvent();
    void handleClearErrorEvent();
    void handleClearSuccessEvent();
    void handleFirmwareUpdateRequired(const JsonObject &data);
    void onRequestFirmwareInfo();
    void onChangeKeysEvent(const JsonObject &data);
    void onAuthenticateNfcEvent(const JsonObject &data);
    void hexStringToBytes(const String &hexString, uint8_t *byteArray, size_t byteArrayLength);
    void handleShowTextEvent(const JsonObject &data);
    void handleSelectItemEvent(const JsonObject &data);

    // Utility methods
    String generateDeviceId();
    bool isRateLimited() const;
};

#endif // ATTRACCESS_SERVICE_H