#include "AttraccessServiceESP.h"
#include "MainScreenUI.h"
#include "nfc.hpp"
#include "LEDService.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_crt_bundle.h"
#include "esp_tls.h"
#include "AdaptiveCertManager.h"
#include "WiFiServiceESP.h"
#include "esp_task_wdt.h"
#include "version.h"

static const char *TAG = "AttraccessServiceESP";

// Static instance for event handlers
AttraccessServiceESP *AttraccessServiceESP::instance = nullptr;

AttraccessServiceESP::AttraccessServiceESP()
    : ws_client(nullptr),
      serverPort(0),
      configValid(false),
      currentState(DISCONNECTED),
      connecting(false),
      authenticated(false),
      registering(false),
      needsCleanup(false),
      needsCertificateRetry(false),
      lastConnectionAttempt(millis() - CONNECTION_RETRY_INTERVAL),
      lastHeartbeat(0),
      lastStateChange(0),
      connectionReadyTime(0),
      totalChunkCount(0),
      currentChunk(0),
      firmwareUpdateStartTime(0),
      lastDataReceivedTime(0),
      firmwareUpdateRetryCount(0),
      stateCallback(nullptr),
      firmwareDownloadInProgress(false),
      otaHandle(0),
      updatePartition(nullptr),
      otaStarted(false)
{
    instance = this;
}

AttraccessServiceESP::~AttraccessServiceESP()
{
    disconnect();
    instance = nullptr;
}

void AttraccessServiceESP::begin()
{
    Serial.println("AttraccessServiceESP: Initializing...");

    // Enable debug logging for OTA operations
    esp_log_level_set("esp_ota_ops", ESP_LOG_DEBUG);
    Serial.println("AttraccessServiceESP: Enabled debug logging for OTA operations");

    preferences.begin("attraccess", false);

    // Initialize adaptive certificate manager
    if (!adaptiveCertManager.begin())
    {
        Serial.println("AttraccessServiceESP: WARNING - Failed to initialize certificate manager");
    }

    loadCredentials();

    // Load server configuration from settings
    Preferences settingsPrefs;
    settingsPrefs.begin("attraccess", true);
    String hostnameFromPrefs = settingsPrefs.getString("hostname", "");

    // Load port as string (both CLI and UI save as string for consistency)
    String portString = settingsPrefs.getString("port", "0");
    int16_t portFromPrefs = portString.toInt();

    settingsPrefs.end();

    setServerConfig(hostnameFromPrefs, portFromPrefs);
    Serial.printf("AttraccessServiceESP: Loaded config - %s:%d\n", hostnameFromPrefs.c_str(), portFromPrefs);

    if (!hasValidConfig())
    {
        Serial.println("AttraccessServiceESP: WARNING - No valid server configuration found!");
        Serial.println("AttraccessServiceESP: Please configure hostname and port via CLI or settings before connecting");
        Serial.println("AttraccessServiceESP: CLI example: attraccess_config {\"hostname\":\"your-server.com\",\"port\":443}");
    }
    else
    {
        Serial.println("AttraccessServiceESP: Valid server configuration found - will auto-connect when WiFi is ready");
        Serial.println("AttraccessServiceESP: ESP-IDF certificate bundle enabled for secure HTTPS connections");
    }

    setState(DISCONNECTED, "Service initialized");
    Serial.println("AttraccessServiceESP: Ready");
}

bool AttraccessServiceESP::connect()
{
    if (!hasValidConfig())
    {
        Serial.println("AttraccessServiceESP: Cannot connect - invalid configuration");
        setState(ERROR_INVALID_SERVER, "Invalid server configuration");
        return false;
    }

    if (connecting || currentState >= CONNECTED)
    {
        // Only log this message every 15 seconds to avoid spam
        static uint32_t lastAlreadyConnectedLog = 0;
        if (millis() - lastAlreadyConnectedLog > 15000)
        {
            lastAlreadyConnectedLog = millis();
            Serial.printf("AttraccessServiceESP: Connection already in progress or connected (state: %s, connecting: %s)\n",
                          getConnectionStateString().c_str(), connecting ? "true" : "false");
        }
        return false;
    }

    if (isRateLimited())
    {
        // Only log rate limiting message every 10 seconds to avoid spam
        static uint32_t lastRateLimitLog = 0;
        if (millis() - lastRateLimitLog > 10000)
        {
            lastRateLimitLog = millis();
            uint32_t remainingTime = CONNECTION_RETRY_INTERVAL - (millis() - lastConnectionAttempt);
            Serial.printf("AttraccessServiceESP: Rate limited - %lu ms remaining before next attempt\n", remainingTime);
        }
        return false;
    }

    // Always log actual connection attempts, but this is rate-limited by the connect() guards above
    Serial.printf("AttraccessServiceESP: Starting connection attempt to %s:%d\n",
                  serverHostname.c_str(), serverPort);

    connecting = true;
    lastConnectionAttempt = millis();
    setState(CONNECTING_WEBSOCKET, "Establishing WebSocket connection");

    bool result = establishWebSocketConnection();

    // If connection establishment failed immediately, reset connecting flag
    if (!result)
    {
        Serial.println("AttraccessServiceESP: WebSocket establishment failed immediately");
        connecting = false;
    }

    return result;
}

bool AttraccessServiceESP::establishWebSocketConnection()
{
    if (ws_client)
    {
        esp_websocket_client_destroy(ws_client);
        ws_client = nullptr;
    }

    String wsUrl = buildWebSocketURL();
    Serial.printf("AttraccessServiceESP: Connecting to WebSocket: %s\n", wsUrl.c_str());

    esp_websocket_client_config_t websocket_cfg = {};
    websocket_cfg.uri = wsUrl.c_str();
    websocket_cfg.port = serverPort;

    // Configure buffer sizes to prevent ENOBUFS errors
    websocket_cfg.buffer_size = 4096; // Increase buffer size (default is typically 1024)
    websocket_cfg.task_stack = 8192;  // Increase task stack size for stability
    websocket_cfg.task_prio = 5;      // Set appropriate task priority

    // Configure connection timeouts
    // websocket_cfg.ping_interval_sec = 5;     // Send ping every 30 seconds
    // websocket_cfg.pingpong_timeout_sec = 15; // Timeout for pong response

    // Configure SSL with adaptive certificate manager
    if (!adaptiveCertManager.configureWebSocketSSL(&websocket_cfg))
    {
        Serial.println("AttraccessServiceESP: Failed to configure SSL certificates");
        setState(ERROR_FAILED, "SSL configuration failed");
        connecting = false;
        return false;
    }

    ws_client = esp_websocket_client_init(&websocket_cfg);
    if (!ws_client)
    {
        Serial.println("AttraccessServiceESP: Failed to initialize WebSocket client");
        setState(ERROR_FAILED, "WebSocket initialization failed");
        connecting = false;
        return false;
    }

    // Register event handler
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, websocket_event_handler, this);

    // Start connection
    esp_err_t ret = esp_websocket_client_start(ws_client);
    if (ret != ESP_OK)
    {
        Serial.printf("AttraccessServiceESP: Failed to start WebSocket client: %s\n", esp_err_to_name(ret));
        setState(ERROR_FAILED, "WebSocket connection failed");
        connecting = false;
        return false;
    }

    return true;
}

String AttraccessServiceESP::buildWebSocketURL()
{
    String protocol = (serverPort == 443) ? "wss" : "ws";
    return protocol + "://" + serverHostname + ":" + String(serverPort) + "/api/attractap/websocket";
}

void AttraccessServiceESP::websocket_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    AttraccessServiceESP *self = (AttraccessServiceESP *)arg;
    if (!self)
        return;

    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;

    switch (event_id)
    {
    case WEBSOCKET_EVENT_CONNECTED:
        Serial.println("AttraccessServiceESP: WebSocket connected");
        self->connecting = false;

        // Mark current certificate as successful
        adaptiveCertManager.markSuccess();

        self->setState(CONNECTED, "WebSocket connected");

        // Add a small delay to ensure WebSocket is fully ready for sending
        // This helps prevent the 0x58 send error that causes the infinite loop
        self->connectionReadyTime = millis() + 100; // 100ms delay
        break;

    case WEBSOCKET_EVENT_DISCONNECTED:
    {
        Serial.println("AttraccessServiceESP: WebSocket disconnected");
        self->authenticated = false;
        self->registering = false; // Clear registration flag on disconnection
        self->readerName = "";
        self->connecting = false;

        // Check if this might be an SSL certificate error and we should try next certificate
        static uint32_t lastCertRetryAttempt = 0;
        uint32_t now = millis();

        if (self->serverPort == 443 &&
            (now - lastCertRetryAttempt > 200))
        { // Avoid rapid retries, wait at least 200ms

            Serial.println("AttraccessServiceESP: SSL connection failure detected, scheduling certificate retry...");
            lastCertRetryAttempt = now;

            // Schedule certificate retry to happen in update() method
            self->needsCertificateRetry = true;
            self->needsCleanup = true; // Clean up current client
            return;                    // Don't set disconnected state yet, let retry handle it
        }

        // If not SSL or no more certificates to try, proceed with normal disconnection handling
        self->needsCleanup = true;
        self->setState(DISCONNECTED, "WebSocket disconnected");
        break;
    }

    case WEBSOCKET_EVENT_DATA:
        if (data->op_code == 0x01)
        { // Text frame
            String message = String((char *)data->data_ptr, data->data_len);
            Serial.printf("AttraccessServiceESP: Received: %s\n", message.c_str());
            self->processIncomingMessage(message);
        }
        else if (data->op_code == 0x02)
        { // Binary frame
            Serial.printf("AttraccessServiceESP: Received binary data: %zu bytes\n", data->data_len);
            self->handleFirmwareStreamChunk((const uint8_t *)data->data_ptr, data->data_len);
        }
        break;

    case WEBSOCKET_EVENT_ERROR:
        Serial.println("AttraccessServiceESP: WebSocket error");
        self->connecting = false;
        self->registering = false; // Clear registration flag on error
        self->needsCleanup = true;
        self->setState(ERROR_FAILED, "WebSocket error");
        break;

    default:
        break;
    }
}

void AttraccessServiceESP::update()
{
    if (firmwareDownloadInProgress)
    {
        uint32_t now = millis();
        if (now - lastFirmwareChunkRequestTime > FIRMWARE_CHUNK_REQUEST_TIMEOUT_MS)
        {
            if (firmwareDownloadRetryCount >= MAX_FIRMWARE_CHUNK_DOWNLOAD_RETRY_ATTEMPTS)
            {
                Serial.println("AttraccessServiceESP: Firmware chunk download failed, restarting esp");
                ESP.restart();
                return;
            }

            firmwareDownloadRetryCount++;
            Serial.println("AttraccessServiceESP: Firmware chunk request timeout, requesting again");
            firmwareDownloadRetryCount++;
            requestFirmwareChunk();
        }
    }

    // Safe WebSocket cleanup (avoid destroying client from within its own event handler)
    if (needsCleanup && ws_client)
    {
        esp_websocket_client_destroy(ws_client);
        ws_client = nullptr;
        needsCleanup = false;
        connectionReadyTime = 0; // Reset ready time when cleaning up
        Serial.println("AttraccessServiceESP: WebSocket client safely cleaned up");
    }

    // Handle certificate retry outside of event handler context
    if (needsCertificateRetry)
    {
        needsCertificateRetry = false;
        Serial.println("AttraccessServiceESP: Executing certificate retry...");

        if (adaptiveCertManager.tryNextCertificate())
        {
            Serial.printf("AttraccessServiceESP: Retrying connection with certificate: %s\n",
                          adaptiveCertManager.getCurrentCertName());

            // Reset connecting state and try again
            connecting = false;

            // Small delay before retry to avoid overwhelming the system
            delay(1000);

            connect();
        }
        else
        {
            Serial.println("AttraccessServiceESP: No more certificates to try, connection failed");
            setState(ERROR_FAILED, "All certificates failed");
        }
        return; // Skip other update logic this cycle
    }

    LEDService::attraccessAuthenticated = currentState == AttraccessServiceESP::AUTHENTICATED;

    // Send heartbeat if authenticated
    if (authenticated && millis() - lastHeartbeat > HEARTBEAT_INTERVAL)
    {
        sendHeartbeat();
    }

    // Handle delayed authentication/registration when connection becomes ready
    if (currentState == AUTHENTICATING && connectionReadyTime > 0 && millis() >= connectionReadyTime)
    {
        Serial.println("AttraccessServiceESP: Connection now ready, attempting delayed authentication/registration");

        if (!deviceId.isEmpty() && !authToken.isEmpty())
        {
            // Try authentication with saved credentials
            JsonDocument authDoc;
            authDoc["event"] = "EVENT";
            authDoc["data"]["type"] = "READER_AUTHENTICATE";
            authDoc["data"]["payload"]["id"] = deviceId;
            authDoc["data"]["payload"]["token"] = authToken;

            if (!sendJSONMessage(authDoc.as<JsonObject>()))
            {
                Serial.println("AttraccessServiceESP: Failed to send delayed authentication");
            }
        }
        else
        {
            // Try registration
            registerDevice();
        }

        connectionReadyTime = 0; // Clear the delay
    }

    // Auto-reconnect logic with detailed debugging
    static uint32_t lastDebugLog = 0;
    bool shouldAttemptReconnect = false;

    // Check if we should attempt reconnection
    if (currentState == DISCONNECTED)
    {
        shouldAttemptReconnect = true;
    }
    else if (currentState == ERROR_FAILED || currentState == ERROR_TIMED_OUT || currentState == ERROR_INVALID_SERVER)
    {
        // Transition error states back to DISCONNECTED after rate limit period
        // This allows auto-reconnect to work after connection failures
        if (!isRateLimited())
        {
            // Only log state transitions every 30 seconds to avoid spam
            static uint32_t lastStateTransitionLog = 0;
            if (millis() - lastStateTransitionLog > 30000)
            {
                lastStateTransitionLog = millis();
                Serial.printf("AttraccessServiceESP: Transitioning from %s to DISCONNECTED for retry\n",
                              getConnectionStateString().c_str());
            }
            setState(DISCONNECTED, "Ready for reconnection attempt");
            shouldAttemptReconnect = true;
        }
    }

    if (shouldAttemptReconnect)
    {
        // Log debug info every 30 seconds when disconnected
        if (millis() - lastDebugLog > 30000)
        {
            lastDebugLog = millis();
            Serial.printf("AttraccessServiceESP: Disconnected - Config valid: %s, WiFi: %s, Rate limited: %s\n",
                          hasValidConfig() ? "yes" : "no",
                          isWiFiConnected() ? "connected" : "disconnected",
                          isRateLimited() ? "yes" : "no");

            if (!hasValidConfig())
            {
                Serial.printf("AttraccessServiceESP: Invalid config - hostname: '%s', port: %d\n",
                              serverHostname.c_str(), serverPort);
                Serial.println("AttraccessServiceESP: Please configure server hostname and port via CLI or settings");
            }
        }

        if (hasValidConfig())
        {
            // Check if WiFi is connected using ESP-IDF API
            if (isWiFiConnected() && !isRateLimited())
            {
                // Only log auto-reconnect attempts (not every call to connect)
                static uint32_t lastAutoReconnectLog = 0;
                if (millis() - lastAutoReconnectLog > 30000)
                {
                    lastAutoReconnectLog = millis();
                    Serial.println("AttraccessServiceESP: Attempting auto-reconnect...");
                }
                connect();
            }
            else
            {
                // Debug why we're not attempting reconnect
                static uint32_t lastDebugReason = 0;
                if (millis() - lastDebugReason > 30000) // Log every 30 seconds (less frequent)
                {
                    lastDebugReason = millis();
                    Serial.printf("AttraccessServiceESP: Not reconnecting - WiFi: %s, Rate limited: %s, Connecting: %s\n",
                                  isWiFiConnected() ? "connected" : "disconnected",
                                  isRateLimited() ? "yes" : "no",
                                  connecting ? "true" : "false");

                    // Backup WiFi reconnection mechanism - trigger WiFi reconnection if WiFi is down
                    // and we have a WiFiService reference and it's not already connecting
                    if (!isWiFiConnected() && wifiService && !wifiService->isConnecting())
                    {
                        if (wifiService->isAutoReconnectEnabled())
                        {
                            Serial.println("AttraccessServiceESP: WiFiService auto-reconnect is enabled, waiting for it to handle reconnection");
                        }
                        else if (wifiService->hasSavedCredentials())
                        {
                            Serial.println("AttraccessServiceESP: BACKUP - Triggering WiFi reconnection as fallback mechanism");
                            wifiService->tryAutoConnect();
                        }
                        else
                        {
                            Serial.println("AttraccessServiceESP: No saved WiFi credentials available for backup reconnection");
                        }
                    }
                }
            }
        }
    }
    else
    {
        // Debug why shouldAttemptReconnect is false
        static uint32_t lastShouldAttemptDebug = 0;
        if (millis() - lastShouldAttemptDebug > 30000) // Log every 30 seconds (less frequent)
        {
            lastShouldAttemptDebug = millis();
            Serial.printf("AttraccessServiceESP: Not attempting reconnect - State: %s, Connecting: %s\n",
                          getConnectionStateString().c_str(), connecting ? "true" : "false");
        }
    }

    // Handle connection timeout
    if (connecting && millis() - lastConnectionAttempt > CONNECTION_TIMEOUT)
    {
        Serial.println("AttraccessServiceESP: Connection timeout");
        setState(ERROR_TIMED_OUT, "Connection timeout");
        connecting = false;
    }

    // Safety mechanism: Reset connecting flag if stuck in error states
    if (connecting && (currentState == ERROR_FAILED || currentState == ERROR_TIMED_OUT || currentState == DISCONNECTED))
    {
        static uint32_t lastStuckCheck = 0;
        if (millis() - lastStuckCheck > 10000) // Check every 10 seconds (less frequent)
        {
            lastStuckCheck = millis();
            if (millis() - lastConnectionAttempt > CONNECTION_TIMEOUT + 10000) // 20 seconds total (more conservative)
            {
                Serial.println("AttraccessServiceESP: Safety reset - connecting flag was stuck, resetting");
                connecting = false;
            }
        }
    }

    // Safety mechanism: Reset registering flag if stuck
    if (registering && (currentState == ERROR_FAILED || currentState == ERROR_TIMED_OUT || currentState == DISCONNECTED))
    {
        static uint32_t lastRegisteringStuckCheck = 0;
        if (millis() - lastRegisteringStuckCheck > 15000) // Check every 15 seconds
        {
            lastRegisteringStuckCheck = millis();
            Serial.println("AttraccessServiceESP: Safety reset - registering flag was stuck, resetting");
            registering = false;
        }
    }
}

void AttraccessServiceESP::disconnect()
{
    Serial.println("AttraccessServiceESP: Disconnecting...");

    connecting = false;
    authenticated = false;
    registering = false;  // Clear registration flag
    needsCleanup = false; // Clear cleanup flag
    readerName = "";

    if (ws_client)
    {
        esp_websocket_client_destroy(ws_client);
        ws_client = nullptr;
    }

    setState(DISCONNECTED, "Disconnected");
    Serial.println("AttraccessServiceESP: Disconnected successfully");
}

bool AttraccessServiceESP::isConnected()
{
    return currentState >= CONNECTED && ws_client && esp_websocket_client_is_connected(ws_client);
}

bool AttraccessServiceESP::isAuthenticated()
{
    return authenticated && isConnected();
}

bool AttraccessServiceESP::sendMessage(const String &eventType, const JsonObject &data)
{
    if (!isAuthenticated())
    {
        Serial.println("AttraccessServiceESP: Cannot send message - not authenticated");
        return false;
    }

    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = eventType;
    doc["data"]["payload"] = data;

    return sendJSONMessage(doc.as<JsonObject>());
}

bool AttraccessServiceESP::sendJSONMessage(const JsonObject &messageObj)
{
    if (!ws_client || !esp_websocket_client_is_connected(ws_client))
    {
        Serial.println("AttraccessServiceESP: Cannot send - WebSocket not connected");
        return false;
    }

    // Check if connection is ready for sending (prevents 0x58 error)
    if (connectionReadyTime > 0 && millis() < connectionReadyTime)
    {
        Serial.println("AttraccessServiceESP: WebSocket not ready for sending yet, waiting...");
        return false;
    }

    String jsonString;
    serializeJson(messageObj, jsonString);

    if (jsonString.length() > 1024)
    {
        Serial.println("AttraccessServiceESP: Message too large (>1024 bytes)");
        return false;
    }

    Serial.printf("AttraccessServiceESP: Sending: %s\n", jsonString.c_str());

    // Send JSON message via WebSocket with shorter timeout to detect issues faster
    esp_err_t ret = esp_websocket_client_send_text(ws_client, jsonString.c_str(), jsonString.length(), pdMS_TO_TICKS(5000));

    if (ret != ESP_OK)
    {
        Serial.printf("AttraccessServiceESP: Send error: %s (0x%x)\n", esp_err_to_name(ret), ret);
        Serial.printf("AttraccessServiceESP: WebSocket connected: %s\n",
                      esp_websocket_client_is_connected(ws_client) ? "true" : "false");

        Serial.println("AttraccessServiceESP: ignoring send error");
    }

    return true;
}

void AttraccessServiceESP::registerDevice()
{
    // Add debug logging to diagnose connection state
    Serial.printf("AttraccessServiceESP: registerDevice() called - currentState=%d, ws_client=%p, registering=%s\n",
                  currentState, ws_client, registering ? "true" : "false");

    // Prevent multiple simultaneous registration attempts
    if (registering)
    {
        Serial.println("AttraccessServiceESP: Registration already in progress, skipping duplicate attempt");
        return;
    }

    if (ws_client)
    {
        Serial.printf("AttraccessServiceESP: WebSocket connected check: %s\n",
                      esp_websocket_client_is_connected(ws_client) ? "true" : "false");
    }

    if (!isConnected())
    {
        Serial.println("AttraccessServiceESP: Cannot register - not connected");
        Serial.printf("AttraccessServiceESP: Connection check failed - state: %s, ws_client: %p, esp_connected: %s\n",
                      getConnectionStateString().c_str(),
                      ws_client,
                      ws_client ? (esp_websocket_client_is_connected(ws_client) ? "true" : "false") : "null");
        return;
    }

    // Check if connection is ready for sending
    if (connectionReadyTime > 0 && millis() < connectionReadyTime)
    {
        Serial.printf("AttraccessServiceESP: WebSocket not ready for registration yet, waiting %lu ms...\n",
                      connectionReadyTime - millis());
        return;
    }

    Serial.println("AttraccessServiceESP: Registering new device...");

    // Set registration flag to prevent duplicate attempts
    registering = true;
    setState(AUTHENTICATING, "Registering device...");

    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "READER_REGISTER";
    doc["data"]["payload"]["deviceType"] = String("ESP32_CYD").c_str();

    if (sendJSONMessage(doc.as<JsonObject>()))
    {
        Serial.println("AttraccessServiceESP: Registration request sent");
    }
    else
    {
        Serial.println("AttraccessServiceESP: Failed to send registration");

        // Clear registration flag on send failure
        registering = false;

        // Don't immediately set error state if it's just a timing issue
        if (connectionReadyTime > 0 && millis() < connectionReadyTime + 1000)
        {
            Serial.println("AttraccessServiceESP: Registration send failed, but connection might not be ready yet");
            // Will retry on next update cycle
        }
        else
        {
            setState(ERROR_FAILED, "Registration send failed");
        }
    }
}

void AttraccessServiceESP::sendHeartbeat()
{
    if (!isAuthenticated())
        return;

    JsonDocument doc;
    doc["event"] = "HEARTBEAT";
    doc["data"].to<JsonObject>(); // Create empty object properly

    if (sendJSONMessage(doc.as<JsonObject>()))
    {
        // Only log heartbeat every 5 minutes to reduce log spam
        static uint32_t lastHeartbeatLog = 0;
        if (millis() - lastHeartbeatLog > 300000) // 5 minutes
        {
            lastHeartbeatLog = millis();
            Serial.println("AttraccessServiceESP: Heartbeat sent (logging every 5 min)");
        }
    }
    lastHeartbeat = millis();
}

// Rate limiting helper
bool AttraccessServiceESP::isRateLimited() const
{
    uint32_t currentTime = millis();

    // Handle potential overflow of millis() (happens every ~49 days)
    if (currentTime < lastConnectionAttempt)
    {
        // Overflow occurred, allow connection attempt
        return false;
    }

    uint32_t timeSinceLastAttempt = currentTime - lastConnectionAttempt;
    bool isLimited = timeSinceLastAttempt < CONNECTION_RETRY_INTERVAL;

    return isLimited;
}

// Configuration and state management (similar to original)
void AttraccessServiceESP::setServerConfig(const String &hostname, uint16_t port)
{
    // Check if the configuration is actually changing from a previously valid config
    // Don't consider it a change if we're setting up the initial configuration
    bool hadPreviousConfig = !serverHostname.isEmpty() && serverPort > 0;
    bool configChanged = hadPreviousConfig && (serverHostname != hostname || serverPort != port);

    serverHostname = hostname;
    serverPort = port;
    configValid = !hostname.isEmpty() && port > 0 && port <= 65535;

    Serial.printf("AttraccessServiceESP: Server config updated - %s:%d (valid: %s)\n",
                  hostname.c_str(), port, configValid ? "yes" : "no");

    // If configuration changed and we have an active connection, disconnect to reconnect with new settings
    if (configChanged && (isConnected() || connecting))
    {
        Serial.println("AttraccessServiceESP: Server configuration changed - disconnecting to reconnect with new settings");
        disconnect();
        // The auto-reconnect mechanism in update() will handle reconnection with the new configuration
    }

    // Only clear device credentials if server configuration actually changed from a previous valid config
    // Don't clear credentials during initial setup
    if (configChanged)
    {
        Serial.println("AttraccessServiceESP: Server configuration changed - clearing device credentials for re-registration");
        deviceId = "";
        authToken = "";
        readerName = "";
        authenticated = false;
        registering = false; // Clear registration flag
        saveCredentials();
    }
}

bool AttraccessServiceESP::hasValidConfig() const
{
    return configValid;
}

bool AttraccessServiceESP::isWiFiConnected()
{
    wifi_ap_record_t ap_info;
    esp_err_t ret = esp_wifi_sta_get_ap_info(&ap_info);
    return ret == ESP_OK;
}

String AttraccessServiceESP::getDeviceId()
{
    return this->deviceId;
}

String AttraccessServiceESP::getHostname()
{
    return serverHostname;
}

uint16_t AttraccessServiceESP::getPort()
{
    return serverPort;
}

// Rest of the implementation follows the same pattern as the original AttraccessServiceESP
// but uses ESP-IDF WebSocket client instead of PicoWebsocket

void AttraccessServiceESP::processIncomingMessage(const String &message)
{
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, message);

    if (error)
    {
        Serial.printf("AttraccessServiceESP: JSON parse error: %s\n", error.c_str());
        return;
    }

    String event = doc["event"].as<String>();
    JsonObject data = doc["data"].as<JsonObject>();

    Serial.printf("AttraccessServiceESP: Received message of type: %s\n", event.c_str());

    if (event == "RESPONSE")
    {
        String type = data["type"].as<String>();
        handleResponseEvent(type, data);
    }
    else if (event == "EVENT")
    {
        String type = data["type"].as<String>();
        handleEventType(type, data);
    }
    else if (event == "HEARTBEAT")
    {
        handleHeartbeatEvent();
    }
    else if (event == "UNAUTHORIZED")
    {
        handleUnauthorizedEvent();
    }
}

void AttraccessServiceESP::handleResponseEvent(const String &type, const JsonObject &data)
{
    if (type == "READER_REGISTER")
    {
        handleRegistration(data);
    }
    else if (type == "READER_AUTHENTICATED")
    {
        handleAuthentication(data);
    }
}

void AttraccessServiceESP::handleRegistration(const JsonObject &data)
{
    // Clear registration flag as we're now handling the response
    registering = false;

    // Check if payload contains id and token (indicates success)
    if (data["payload"]["id"] && data["payload"]["token"])
    {
        deviceId = data["payload"]["id"].as<String>();
        authToken = data["payload"]["token"].as<String>();

        Serial.printf("AttraccessServiceESP: Registration successful - ID: %s\n", deviceId.c_str());

        saveCredentials();
        authenticated = true;
        setState(AUTHENTICATED, "Device registered and authenticated");
    }
    else
    {
        String errorMsg = data["message"] | "Registration failed";
        Serial.printf("AttraccessServiceESP: Registration failed: %s\n", errorMsg.c_str());
        setState(ERROR_FAILED, errorMsg);
    }
}

void AttraccessServiceESP::handleAuthentication(const JsonObject &data)
{
    // if READER_AUTHENTICATED response does not contain a "name" field -> ignore it
    if (!data["payload"]["name"])
    {
        Serial.println("AttraccessServiceESP: Authentication successful - Reader name not set");
        return;
    }

    readerName = data["payload"]["name"].as<String>();
    Serial.printf("AttraccessServiceESP: Authentication successful - Reader name: %s\n", readerName.c_str());
    authenticated = true;

    // Always call setState, but also force callback if we're already authenticated
    // to ensure UI is updated with the latest reader name
    ConnectionState oldState = currentState;
    setState(AUTHENTICATED, "Authenticated");

    // If state didn't change (we were already authenticated), manually trigger callback
    // to ensure UI gets updated with the new reader name
    if (oldState == AUTHENTICATED && stateCallback)
    {
        Serial.println("AttraccessServiceESP: Reauthentication detected - forcing UI update");
        stateCallback(AUTHENTICATED, "Reauthenticated");
    }
}

void AttraccessServiceESP::handleEventType(const String &type, const JsonObject &data)
{
    if (type == "READER_UNAUTHORIZED")
    {
        handleUnauthorizedEvent();
    }
    else if (type == "READER_AUTHENTICATE")
    {
        Serial.println("AttraccessServiceESP: Server requested authentication");
        // Reset authentication state and try again
        authenticated = false;
        setState(AUTHENTICATING, "Authenticating...");

        // Send authentication request with existing credentials
        if (!deviceId.isEmpty() && !authToken.isEmpty())
        {
            // Check if connection is ready before sending authentication
            if (connectionReadyTime > 0 && millis() < connectionReadyTime)
            {
                Serial.printf("AttraccessServiceESP: Delaying authentication until connection ready (%lu ms)\n",
                              connectionReadyTime - millis());
                return; // Will retry on next update cycle
            }

            JsonDocument authDoc;
            authDoc["event"] = "EVENT";
            authDoc["data"]["type"] = "READER_AUTHENTICATE";
            authDoc["data"]["payload"]["id"] = deviceId;
            authDoc["data"]["payload"]["token"] = authToken;

            if (!sendJSONMessage(authDoc.as<JsonObject>()))
            {
                Serial.println("AttraccessServiceESP: Failed to send authentication");
            }
        }
        else
        {
            // Only register if connection is ready
            if (connectionReadyTime == 0 || millis() >= connectionReadyTime)
            {
                this->registerDevice();
            }
            else
            {
                Serial.printf("AttraccessServiceESP: Delaying registration until connection ready (%lu ms)\n",
                              connectionReadyTime - millis());
            }
        }
    }
    else if (type == "DISPLAY_ERROR")
    {
        handleDisplayErrorEvent(data);
    }
    else if (type == "CLEAR_ERROR")
    {
        handleClearErrorEvent();
    }
    else if (type == "DISPLAY_SUCCESS")
    {
        handleDisplaySuccessEvent(data);
    }
    else if (type == "CLEAR_SUCCESS")
    {
        handleClearSuccessEvent();
    }
    else if (type == "NFC_ENABLE_CARD_CHECKING")
    {
        handleEnableCardCheckingEvent(data);
    }
    else if (type == "NFC_DISABLE_CARD_CHECKING")
    {
        LEDService::waitForNFCTap = LEDService::WAIT_FOR_NFC_TAP_NONE;
        handleDisableCardCheckingEvent();
    }
    else if (type == "READER_FIRMWARE_UPDATE_REQUIRED")
    {
        handleFirmwareUpdateRequired(data);
    }
    else if (type == "READER_FIRMWARE_INFO")
    {
        onRequestFirmwareInfo();
    }
    else if (type == "NFC_CHANGE_KEYS")
    {
        onChangeKeysEvent(data);
    }
    else if (type == "NFC_AUTHENTICATE")
    {
        onAuthenticateNfcEvent(data);
    }
    else if (type == "SHOW_TEXT")
    {
        handleShowTextEvent(data);
    }

    if (type == "SELECT_ITEM")
    {
        LEDService::waitForResourceSelection = true;
        handleSelectItemEvent(data);
    }
    else
    {
        LEDService::waitForResourceSelection = false;
    }

    Serial.printf("AttraccessServiceESP: Received event type: %s\n", type.c_str());
}

void AttraccessServiceESP::handleHeartbeatEvent()
{
    // Server heartbeat received - connection is healthy
    // Only log heartbeat reception every 5 minutes to reduce log spam
    static uint32_t lastHeartbeatRxLog = 0;
    if (millis() - lastHeartbeatRxLog > 300000) // 5 minutes
    {
        lastHeartbeatRxLog = millis();
        Serial.println("AttraccessServiceESP: Heartbeat received from server (logging every 5 min)");
    }
}

void AttraccessServiceESP::handleUnauthorizedEvent()
{
    Serial.println("AttraccessServiceESP: Received READER_UNAUTHORIZED - clearing credentials and re-registering");
    // Clear invalid credentials
    deviceId = "";
    authToken = "";
    readerName = ""; // Clear reader name on unauthorized
    authenticated = false;
    registering = false; // Clear registration flag
    saveCredentials();

    ESP.restart();
}

void AttraccessServiceESP::handleDisplayErrorEvent(const JsonObject &data)
{
    if (mainContentCallback && data["payload"]["message"])
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_ERROR;
        content.message = data["payload"]["message"].as<String>();
        // durationMs is no longer used, so do not set it
        mainContentCallback(content);
    }
}

void AttraccessServiceESP::handleClearErrorEvent()
{
    if (mainContentCallback)
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_NONE;
        mainContentCallback(content);
    }
}

void AttraccessServiceESP::handleDisplaySuccessEvent(const JsonObject &data)
{
    if (mainContentCallback && data["payload"]["message"])
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_SUCCESS;
        content.message = data["payload"]["message"].as<String>();
        // durationMs is no longer used, so do not set it
        mainContentCallback(content);
    }
}

void AttraccessServiceESP::handleClearSuccessEvent()
{
    if (mainContentCallback)
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_NONE;
        mainContentCallback(content);
    }
}

void AttraccessServiceESP::handleShowTextEvent(const JsonObject &data)
{
    if (mainContentCallback && data["payload"]["message"])
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_TEXT;
        content.message = data["payload"]["message"].as<String>();
        // durationMs is no longer used, so do not set it
        mainContentCallback(content);
    }
}

void AttraccessServiceESP::handleEnableCardCheckingEvent(const JsonObject &data)
{
    Serial.println("[DEBUG] Entered handleEnableCardCheckingEvent");
    Serial.printf("[DEBUG] mainContentCallback=%p, data.hasPayload=%d\n", mainContentCallback, (bool)data["payload"]);

    if (!(mainContentCallback && data["payload"]))
    {
        Serial.println("[DEBUG] mainContentCallback is null or payload missing");
        return;
    }

    MainScreenUI::MainContent content;
    content.type = MainScreenUI::CONTENT_CARD_CHECKING;
    content.message = "";

    JsonObject payload = data["payload"];
    Serial.printf("[DEBUG] payload type: %s\n", payload["type"].as<String>().c_str());

    if (payload["type"] == "toggle-resource-usage")
    {
        JsonObject resource = payload["resource"];
        JsonObject activeUsageSession = payload["activeUsageSession"];

        String resourceName = resource["name"].as<String>();
        bool isActive = payload["isActive"].as<bool>();

        bool hasActiveMaintenance = payload["hasActiveMaintenance"].as<bool>();

        if (isActive && activeUsageSession)
        {
            LEDService::waitForNFCTap = LEDService::WAIT_FOR_NFC_TAP_USAGE_END;
            JsonObject user = activeUsageSession["user"];
            String username = user["username"].as<String>();
            // String duration = activeUsageSession["duration"].as<String>();

            content.message = resourceName + "\n\n" + "Tap to end usage" + "\n(" + username + ")";
            content.textColor = 0xF44336; // Red (usage end)
        }
        else
        {
            LEDService::waitForNFCTap = LEDService::WAIT_FOR_NFC_TAP_USAGE_START;
            if (hasActiveMaintenance)
            {
                content.message = resourceName + "\n\n" + "Maintenance in progress";
                content.textColor = 0xF44336; // Red (not allowed for normal users)
            }
            else
            {
                content.message = resourceName + "\n\n" + "Tap to start using";
                content.textColor = 0x4CAF50; // Green (usage start)
            }
        }
    }
    else if (payload["type"] == "enroll-nfc-card")
    {
        LEDService::waitForNFCTap = LEDService::WAIT_FOR_NFC_TAP_ENROLL;

        JsonObject user = payload["user"];
        String username = user["username"].as<String>();
        content.message = "Tap to enroll NFC card\n\n(" + username + ")";
        content.textColor = 0x2196F3; // Blue
        content.showCancelButton = true;
    }
    else if (payload["type"] == "reset-nfc-card")
    {
        LEDService::waitForNFCTap = LEDService::WAIT_FOR_NFC_TAP_RESET;

        JsonObject user = payload["user"];
        String username = user["username"].as<String>();
        JsonObject card = payload["card"];
        int cardId = card["id"].as<int>();
        content.message = "Tap to reset NFC card\n\n(" + username + " #" + String(cardId) + ")";
        content.textColor = 0x9C27B0; // Purple
        content.showCancelButton = true;
    }
    else
    {
        LEDService::waitForNFCTap = LEDService::WAIT_FOR_NFC_TAP_NONE;
        Serial.printf("AttraccessServiceESP: Unknown payload type: %s\n", payload["type"].as<String>().c_str());
        return;
    }

    Serial.println("[DEBUG] Calling mainContentCallback");
    mainContentCallback(content);
    Serial.println("[DEBUG] Returned from mainContentCallback");

    Serial.printf("[DEBUG] nfc pointer: %p\n", nfc);
    // Enable card checking via NFC
    if (nfc)
    {
        Serial.println("[DEBUG] Calling nfc->enableCardChecking()");
        nfc->enableCardChecking();
        Serial.println("[DEBUG] Returned from nfc->enableCardChecking()");
    }
    else
    {
        Serial.println("[DEBUG] nfc pointer is null!");
    }
}

void AttraccessServiceESP::handleDisableCardCheckingEvent()
{
    if (mainContentCallback)
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_NONE;
        mainContentCallback(content);
    }
    // Disable card checking via NFC
    if (nfc)
        nfc->disableCardChecking();
}

void AttraccessServiceESP::handleFirmwareUpdateRequired(const JsonObject &data)
{
    totalChunkCount = data["payload"]["firmware"]["chunks"].as<uint32_t>();
    currentChunk = 0;

    String currentVersion = String(FIRMWARE_VERSION);
    String availableVersion = data["payload"]["available"]["version"].as<String>();

    // Use chunk-based method for firmware updates
    Serial.printf("AttraccessServiceESP: Firmware update required - using chunk-based method\n");
    Serial.printf("AttraccessServiceESP: Current: v%s → Available: v%s\n", currentVersion.c_str(), availableVersion.c_str());

    // Initialize ESP-IDF OTA for firmware update
    updatePartition = esp_ota_get_next_update_partition(NULL);
    if (updatePartition == NULL)
    {
        Serial.println("AttraccessServiceESP: Failed to find OTA update partition");
        return;
    }

    Serial.printf("AttraccessServiceESP: Writing to partition subtype %d at offset 0x%x\n",
                  updatePartition->subtype, updatePartition->address);

    // Temporarily increase watchdog timeout for firmware update
    esp_task_wdt_init(30, false); // 30 seconds timeout for OTA operations

    esp_err_t err = esp_ota_begin(updatePartition, OTA_SIZE_UNKNOWN, &otaHandle);
    if (err != ESP_OK)
    {
        Serial.printf("AttraccessServiceESP: esp_ota_begin failed: %s\n", esp_err_to_name(err));
        updatePartition = NULL;

        // Restore normal watchdog timeout
        esp_task_wdt_init(5, false); // 5 seconds normal timeout
        return;
    }

    otaStarted = true;

    if (mainContentCallback)
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_FIRMWARE_UPDATE;
        content.message = "Firmware Update Available";
        content.subMessage = String("Current: v") + currentVersion + " → Available: v" + availableVersion;
        content.textColor = 0x00FFFF;    // Cyan
        content.subTextColor = 0xAAAAAA; // Light gray
        content.progressPercent = 0;
        content.statusText = "Requesting update...";
        mainContentCallback(content);
    }

    this->requestFirmwareChunk();
}

void AttraccessServiceESP::requestFirmwareChunk()
{
    firmwareDownloadInProgress = true;
    lastFirmwareChunkRequestTime = millis();

    Serial.printf("AttraccessServiceESP: requesting firmware chunk %d of %d\n", currentChunk, totalChunkCount);

    JsonDocument requestDoc;
    requestDoc["event"] = "EVENT";
    requestDoc["data"]["type"] = "READER_FIRMWARE_STREAM_CHUNK";
    requestDoc["data"]["payload"]["chunkIndex"] = currentChunk;
    sendJSONMessage(requestDoc.as<JsonObject>());
}

void AttraccessServiceESP::handleFirmwareStreamChunk(const uint8_t *data, size_t len)
{
    firmwareDownloadRetryCount = 0;

    Serial.printf("AttraccessServiceESP: received firmware chunk %d, size: %zu bytes\n", currentChunk, len);

    if (!otaStarted || updatePartition == NULL)
    {
        Serial.printf("AttraccessServiceESP: OTA not started (%s) or no update partition (%s)\n",
                      otaStarted ? "true" : "false",
                      updatePartition ? "valid" : "null");
        return;
    }

    Serial.printf("AttraccessServiceESP: About to write chunk %d to OTA\n", currentChunk);

    // Feed the watchdog before flash operation to prevent timeout
    esp_task_wdt_reset();

    // Write data directly using ESP-IDF OTA
    bool isFinal = (currentChunk == totalChunkCount - 1);
    esp_err_t err = esp_ota_write(otaHandle, data, len);

    // Feed the watchdog again after flash operation
    esp_task_wdt_reset();

    Serial.printf("AttraccessServiceESP: esp_ota_write result: %s\n", esp_err_to_name(err));
    if (err != ESP_OK)
    {
        Serial.printf("AttraccessServiceESP: esp_ota_write failed: %s\n", esp_err_to_name(err));

        // Update UI to show the specific error
        if (mainContentCallback)
        {
            MainScreenUI::MainContent content;
            content.type = MainScreenUI::CONTENT_FIRMWARE_UPDATE;
            content.message = "Firmware Update Failed";
            content.subMessage = String("OTA Write Error: ") + esp_err_to_name(err);
            content.textColor = 0xFF0000;    // Red
            content.subTextColor = 0xFF0000; // Red
            content.progressPercent = 0;
            content.statusText = "Flash write failed";
            mainContentCallback(content);
        }

        // Clean up OTA operation
        esp_ota_abort(otaHandle);
        otaStarted = false;
        updatePartition = NULL;
        firmwareDownloadInProgress = false;

        // Restore normal watchdog timeout
        esp_task_wdt_init(5, false); // 5 seconds normal timeout
        return;
    }

    int progress = (int)(((float)currentChunk / (float)totalChunkCount) * 100.0f);
    // only update every 5%
    if (progress % 5 == 0)
    {
        updateFirmwareProgressDisplay("Installing...", progress);
    }

    if (isFinal)
    {
        firmwareDownloadInProgress = false;
        Serial.println("AttraccessServiceESP: Final firmware chunk received");

        // Finalize ESP-IDF OTA
        esp_task_wdt_reset(); // Feed watchdog before finalization
        err = esp_ota_end(otaHandle);
        if (err != ESP_OK)
        {
            Serial.printf("AttraccessServiceESP: esp_ota_end failed: %s\n", esp_err_to_name(err));
            otaStarted = false;
            updatePartition = NULL;

            // Restore normal watchdog timeout
            esp_task_wdt_init(5, false); // 5 seconds normal timeout
            return;
        }

        // Set boot partition to the new firmware
        esp_task_wdt_reset(); // Feed watchdog before setting boot partition
        err = esp_ota_set_boot_partition(updatePartition);
        if (err != ESP_OK)
        {
            Serial.printf("AttraccessServiceESP: esp_ota_set_boot_partition failed: %s\n", esp_err_to_name(err));
            otaStarted = false;
            updatePartition = NULL;

            // Restore normal watchdog timeout
            esp_task_wdt_init(5, false); // 5 seconds normal timeout
            return;
        }

        Serial.println("AttraccessServiceESP: OTA update successful, rebooting in 3 seconds...");

        // Update UI to show completion
        if (mainContentCallback)
        {
            MainScreenUI::MainContent content;
            content.type = MainScreenUI::CONTENT_FIRMWARE_UPDATE;
            content.message = "Firmware Update";
            content.subMessage = String("Completed: ") + String(currentChunk + 1) + " of " + String(totalChunkCount) + " chunks";
            content.textColor = 0x00FF00;    // Green
            content.subTextColor = 0xAAAAAA; // Light gray
            content.progressPercent = 100;
            content.statusText = "Complete! Rebooting...";
            mainContentCallback(content);
        }

        otaStarted = false;
        updatePartition = NULL;

        // Restore normal watchdog timeout before reboot
        esp_task_wdt_init(5, false); // 5 seconds normal timeout
        vTaskDelay(pdMS_TO_TICKS(3000));
        ESP.restart();
        return;
    }

    Serial.printf("AttraccessServiceESP: processed chunk %d of %d\n", currentChunk, totalChunkCount);
    Serial.printf("AttraccessServiceESP: About to increment currentChunk from %d to %d\n", currentChunk, currentChunk + 1);
    currentChunk++;

    Serial.printf("AttraccessServiceESP: requesting next firmware chunk (chunk %d)\n", currentChunk);
    requestFirmwareChunk();
}

void AttraccessServiceESP::updateFirmwareProgressDisplay(const String &status, int progressPercent)
{
    if (mainContentCallback)
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_FIRMWARE_UPDATE;
        content.message = "Firmware Update";
        content.subMessage = String(currentChunk) + " / " + String(totalChunkCount) + " chunks";
        content.textColor = 0x00FFFF;    // Cyan
        content.subTextColor = 0xAAAAAA; // Light gray
        content.progressPercent = progressPercent >= 0 ? progressPercent : (int)((float)currentChunk / (float)totalChunkCount * 100.0f);
        content.statusText = status;
        mainContentCallback(content);
    }
}

void AttraccessServiceESP::onRequestFirmwareInfo()
{
    JsonDocument firmwareDoc;
    firmwareDoc["event"] = "RESPONSE";
    firmwareDoc["data"]["type"] = "READER_FIRMWARE_INFO";
    firmwareDoc["data"]["payload"]["name"] = String(FIRMWARE_NAME).c_str();
    firmwareDoc["data"]["payload"]["variant"] = String(FIRMWARE_VARIANT).c_str();
    firmwareDoc["data"]["payload"]["version"] = FIRMWARE_VERSION;

    sendJSONMessage(firmwareDoc.as<JsonObject>());
}

void AttraccessServiceESP::hexStringToBytes(const String &hexString, uint8_t *byteArray, size_t byteArrayLength)
{
    // Initialize array with zeros
    memset(byteArray, 0, byteArrayLength);

    // Process the hex string - 2 characters per byte
    for (size_t i = 0; i < byteArrayLength && i * 2 + 1 < hexString.length(); i++)
    {
        String byteHex = hexString.substring(i * 2, i * 2 + 2);
        byteArray[i] = strtol(byteHex.c_str(), NULL, 16);
    }
}

void AttraccessServiceESP::onChangeKeysEvent(const JsonObject &data)
{
    Serial.println("[API] CHANGE_KEYS");

    // Parse authentication key from hex string
    uint8_t authKey[16];
    String authKeyHex = data["payload"]["authenticationKey"].as<String>();
    this->hexStringToBytes(authKeyHex, authKey, sizeof(authKey));

    JsonObject response;
    response["event"] = "RESPONSE";
    response["data"]["type"] = "CHANGE_KEYS";
    response["data"]["payload"]["failedKeys"] = JsonArray();
    response["data"]["payload"]["successfulKeys"] = JsonArray();
    response["data"]["payload"]["authenticationKey"] = authKeyHex;

    // TODO: if change includes key 0, we need to change it first using provided auth key
    // TODO: if more keys are provided, we need to change them afterwards using new key 0 as auth key

    bool doesChangeKey0 = false;
    for (JsonPair key : data["payload"]["keys"].as<JsonObject>())
    {
        uint8_t keyNumber = key.key().c_str()[0] - '0';
        if (keyNumber == 0)
        {
            doesChangeKey0 = true;

            uint8_t newKey[16];
            String newKeyHex = key.value().as<String>();
            this->hexStringToBytes(newKeyHex, newKey, sizeof(newKey));

            Serial.println("Change KEy Call 1");
            bool success = this->nfc->changeKey(0, authKey, newKey);
            if (!success)
            {
                response["data"]["payload"]["failedKeys"].add(0);
                this->sendJSONMessage(response);
                return;
            }

            response["data"]["payload"]["successfulKeys"].add(0);

            // replace authkey with newkey for further operations
            for (int i = 0; i < 16; i++)
            {
                authKey[i] = newKey[i];
            }

            break;
        }
    }

    // for each key in "keys" object (key = key number as string, value = next key as hex string)
    for (JsonPair key : data["payload"]["keys"].as<JsonObject>())
    {
        uint8_t keyNumber = key.key().c_str()[0] - '0';

        if (keyNumber == 0)
        {
            continue;
        }

        uint8_t newKey[16];
        String newKeyHex = key.value().as<String>();
        this->hexStringToBytes(newKeyHex, newKey, sizeof(newKey));

        Serial.print("[API] executing change key for key number ");
        Serial.print(keyNumber);
        Serial.print(" using current key xxxx");
        for (int i = 10; i < 16; i++)
        {
            Serial.print(authKey[i]);
        }
        Serial.print(" to new key ");
        for (int i = 10; i < 16; i++)
        {
            Serial.print(newKey[i]);
        }
        Serial.println();

        Serial.println("Change key call 3");
        bool success = this->nfc->changeKey(keyNumber, authKey, newKey);
        if (success)
        {
            response["data"]["payload"]["successfulKeys"].add(keyNumber);
        }
        else
        {
            response["data"]["payload"]["failedKeys"].add(keyNumber);
            this->sendJSONMessage(response);
            return;
        }
    }

    this->sendJSONMessage(response);
}

void AttraccessServiceESP::onAuthenticateNfcEvent(const JsonObject &data)
{
    Serial.println("[API] AUTHENTICATE");

    uint8_t authenticationKey[16];
    String authKeyHex = data["payload"]["authenticationKey"].as<String>();
    this->hexStringToBytes(authKeyHex, authenticationKey, sizeof(authenticationKey));

    uint8_t keyNumber = data["payload"]["keyNumber"].as<uint8_t>();

    bool success = this->nfc->authenticate(keyNumber, authenticationKey);
    if (success)
    {
        Serial.println("[API] Authentication successful.");
    }
    else
    {
        Serial.println("[API] Authentication failed.");
    }

    JsonDocument doc;
    doc["event"] = "RESPONSE";
    doc["data"]["type"] = "NFC_AUTHENTICATE";
    doc["data"]["payload"]["authenticationSuccessful"] = success;

    this->sendJSONMessage(doc.as<JsonObject>());
}

// --- New: handle SELECT_ITEM event ---
void AttraccessServiceESP::handleSelectItemEvent(const JsonObject &data)
{
    if (!selectItemCallback)
    {
        Serial.println("AttraccessServiceESP: Received SELECT_ITEM event but no callback set");
        return;
    }

    if (!data["payload"])
    {
        Serial.println("AttraccessServiceESP: Received SELECT_ITEM event but no payload");
        return;
    }

    String label = data["payload"]["label"].as<String>();
    JsonArray options = data["payload"]["options"].as<JsonArray>();
    selectItemCallback(label, options);
}

void AttraccessServiceESP::setState(ConnectionState newState, const String &message)
{
    if (currentState != newState)
    {
        currentState = newState;
        lastStateChange = millis();

        Serial.printf("AttraccessServiceESP: State changed to %d: %s\n", newState, message.c_str());

        if (stateCallback)
        {
            stateCallback(newState, message);
        }
    }
}

// Credential management methods (similar to original)
void AttraccessServiceESP::loadCredentials()
{
    deviceId = preferences.getString("deviceId", "");
    authToken = preferences.getString("authToken", "");

    if (!deviceId.isEmpty())
    {
        Serial.printf("AttraccessServiceESP: Loaded device ID: %s\n", deviceId.c_str());
        Serial.println("AttraccessServiceESP: Auth token loaded successfully");
    }
    else
    {
        Serial.println("AttraccessServiceESP: No saved credentials found - device will register as new");
    }
}

void AttraccessServiceESP::saveCredentials()
{
    preferences.putString("deviceId", deviceId);
    preferences.putString("authToken", authToken);
    Serial.println("AttraccessServiceESP: Credentials saved successfully");
}

void AttraccessServiceESP::clearDeviceCredentials()
{
    // Clear device credentials (for device unpairing)
    preferences.remove("deviceId");
    preferences.remove("authToken");
    Serial.println("AttraccessServiceESP: Device credentials cleared - device will register as new on next connection");

    // Clear in-memory credentials too
    deviceId = "";
    authToken = "";
    authenticated = false;
}

// Stub implementations for missing methods
void AttraccessServiceESP::setSelectItemCallback(SelectItemCallback cb)
{
    selectItemCallback = cb;
}

void AttraccessServiceESP::onNFCTapped(const uint8_t *uid, uint8_t uidLength)
{
    if (!isAuthenticated())
        return;

    // Convert UID to hex string
    String uidHex = "";
    for (uint8_t i = 0; i < uidLength; i++)
    {
        if (uid[i] < 0x10)
        {
            uidHex += "0";
        }
        uidHex += String(uid[i], HEX);
    }

    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "NFC_TAP";
    doc["data"]["payload"]["cardUID"] = uidHex;

    sendJSONMessage(doc.as<JsonObject>());
}

void AttraccessServiceESP::setNFC(NFC *nfc)
{
    this->nfc = nfc;
}

void AttraccessServiceESP::setWiFiService(WiFiServiceESP *wifiSvc)
{
    this->wifiService = wifiSvc;
}

void AttraccessServiceESP::setCurrentIP(IPAddress ip)
{
    currentIp = ip;
}

String AttraccessServiceESP::getConnectionStateString() const
{
    switch (currentState)
    {
    case DISCONNECTED:
        return "Disconnected";
    case CONNECTING_TCP:
        return "Connecting TCP";
    case CONNECTING_WEBSOCKET:
        return "Connecting WebSocket";
    case CONNECTED:
        return "Connected";
    case AUTHENTICATING:
        return "Authenticating";
    case AUTHENTICATED:
        return "Authenticated";
    case ERROR_FAILED:
        return "Error Failed";
    case ERROR_TIMED_OUT:
        return "Error Timeout";
    case ERROR_INVALID_SERVER:
        return "Error Invalid Server";
    default:
        return "Unknown";
    }
}
