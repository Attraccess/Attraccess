#ifndef ATTRACCESS_SERVICE_ESP_H
#define ATTRACCESS_SERVICE_ESP_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "MainScreenUI.h"
#include <functional>
#include "nfc.hpp"
#include "esp_ota_ops.h"
#include "esp_partition.h"

// ESP-IDF includes
#include "esp_websocket_client.h"
#include "esp_wifi.h"

// Forward declaration
class WiFiServiceESP;

class AttraccessServiceESP
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

    AttraccessServiceESP();
    ~AttraccessServiceESP();

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
    void setSelectItemCallback(SelectItemCallback cb);

    void onNFCTapped(const uint8_t *uid, uint8_t uidLength);

    void setNFC(NFC *nfc);
    void setWiFiService(WiFiServiceESP *wifiSvc);

    void setCurrentIP(IPAddress ip);
    String getHostname();
    uint16_t getPort();
    String getDeviceId();

private:
    NFC *nfc = nullptr;
    WiFiServiceESP *wifiService = nullptr;
    std::function<void()> enableCardCheckingCallback;
    std::function<void()> disableCardCheckingCallback;

    // ESP-IDF WebSocket client
    esp_websocket_client_handle_t ws_client;
    Preferences preferences;

    IPAddress currentIp;

    // Configuration
    String serverHostname;
    uint16_t serverPort;
    bool configValid;

    // Connection state management
    ConnectionState currentState;
    bool connecting;
    bool authenticated;
    bool registering;
    bool needsCleanup;
    bool needsCertificateRetry;
    uint32_t lastConnectionAttempt;
    uint32_t lastHeartbeat;
    uint32_t lastStateChange;
    uint32_t connectionReadyTime; // Time when WebSocket is ready for sending

    uint32_t totalChunkCount;
    uint32_t currentChunk;
    String firmwareChecksum;
    uint32_t firmwareUpdateStartTime;
    uint32_t lastDataReceivedTime;
    uint8_t firmwareUpdateRetryCount;
    static const uint8_t MAX_FIRMWARE_RETRY_ATTEMPTS = 3;
    static const uint32_t FIRMWARE_DATA_TIMEOUT_MS = 30000; // 30 seconds without data

    // Reader information
    String deviceId;
    String authToken;
    String readerName;

    // Timing constants
    static const uint32_t CONNECTION_RETRY_INTERVAL = 1000; // 1 second
    static const uint32_t HEARTBEAT_INTERVAL = 25000;       // 25 seconds (server timeout is 30s)
    static const uint32_t CONNECTION_TIMEOUT = 10000;       // 10 seconds

    // Callbacks
    ConnectionStateCallback stateCallback;
    MainContentCallback mainContentCallback;
    SelectItemCallback selectItemCallback;

    // WebSocket event handling
    static void websocket_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
    static AttraccessServiceESP *instance; // For static event handlers

    // Private methods
    bool isWiFiConnected();
    bool checkWebSocketConnection();
    bool establishWebSocketConnection();
    void handleWebSocketMessage(const String &message);
    void sendHeartbeat();
    void loadCredentials();
    void saveCredentials();
    void clearDeviceCredentials();
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

    bool firmwareDownloadInProgress;
    uint8_t firmwareDownloadRetryCount;
    static const uint8_t MAX_FIRMWARE_CHUNK_DOWNLOAD_RETRY_ATTEMPTS = 10;
    // last time we requested a firmware chunk
    uint32_t lastFirmwareChunkRequestTime;
    // timeout to rerequest the same chunk
    static const uint32_t FIRMWARE_CHUNK_REQUEST_TIMEOUT_MS = 10000; // 10 seconds

    // ESP-IDF OTA variables
    esp_ota_handle_t otaHandle;
    const esp_partition_t *updatePartition;
    bool otaStarted;

    void requestFirmwareChunk();
    void handleFirmwareStreamChunk(const uint8_t *data, size_t len);

    // Helper method to update firmware progress display
    void updateFirmwareProgressDisplay(const String &status, int progressPercent = -1);

    String buildWebSocketURL();

    // Rate limiting helpers
    bool isRateLimited() const;
};

#endif // ATTRACCESS_SERVICE_ESP_H