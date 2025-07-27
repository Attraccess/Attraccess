#include "AttraccessService.h"
#include "MainScreenUI.h"
#include "nfc.hpp"
#include "LEDService.h"

AttraccessService::AttraccessService()
    : wsClient(tcpClient, "/api/attractap/websocket"),
      serverPort(0),
      configValid(false),
      currentState(DISCONNECTED),
      connecting(false),
      authenticated(false),
      lastConnectionAttempt(0),
      lastHeartbeat(0),
      lastStateChange(0),
      stateCallback(nullptr)
{
}

AttraccessService::~AttraccessService()
{
    disconnect();
}

void AttraccessService::begin()
{
    Serial.println("AttraccessService: Initializing...");

    preferences.begin("attraccess", false);
    loadCredentials();

    // Load server configuration from settings
    Preferences settingsPrefs;
    settingsPrefs.begin("attraccess", true);
    String hostnameFromPrefs = settingsPrefs.getString("hostname", "");
    int16_t portFromPrefs = settingsPrefs.getShort("port", 0);
    settingsPrefs.end();

    setServerConfig(hostnameFromPrefs, portFromPrefs);
    Serial.printf("AttraccessService: Loaded config - %s:%d\n", hostnameFromPrefs.c_str(), portFromPrefs);

    setState(DISCONNECTED, "Service initialized");
    Serial.println("AttraccessService: Ready");
}

void AttraccessService::update()
{
    LEDService::attraccessAuthenticated = currentState == AttraccessService::AUTHENTICATED;

    // Handle WebSocket events
    if (currentState >= CONNECTED)
    {
        // Process incoming messages
        if (wsClient.available())
        {
            uint8_t buffer[1024];
            const auto bytes_read = wsClient.read(buffer, 1024);
            if (bytes_read > 0)
            {
                String message = String((char *)buffer).substring(0, bytes_read);
                processIncomingMessage(message);
            }
        }

        // Send heartbeat if authenticated
        if (authenticated && millis() - lastHeartbeat > HEARTBEAT_INTERVAL)
        {
            sendHeartbeat();
        }

        // Check connection health
        if (!wsClient.connected())
        {
            Serial.println("AttraccessService: WebSocket connection lost");
            authenticated = false;
            readerName = ""; // Clear reader name on connection loss
            setState(DISCONNECTED, "Connection lost");
        }
    }

    // Auto-reconnect logic
    if (currentState == DISCONNECTED && hasValidConfig() && WiFi.isConnected())
    {
        if (!isRateLimited())
        {
            Serial.println("AttraccessService: Attempting auto-reconnect...");
            connect();
        }
    }

    // Handle connection timeout
    if (connecting && millis() - lastConnectionAttempt > CONNECTION_TIMEOUT)
    {
        Serial.println("AttraccessService: Connection timeout");
        setState(ERROR_TIMED_OUT, "Connection timeout");
        connecting = false;
    }
}

bool AttraccessService::connect()
{
    if (!hasValidConfig())
    {
        Serial.println("AttraccessService: Invalid configuration");
        setState(ERROR_INVALID_SERVER, "Invalid server configuration");
        return false;
    }

    if (!WiFi.isConnected())
    {
        Serial.println("AttraccessService: WiFi not connected");
        setState(ERROR_FAILED, "WiFi not connected");
        return false;
    }

    if (isRateLimited())
    {
        Serial.println("AttraccessService: Rate limited, skipping connection attempt");
        return false;
    }

    Serial.printf("AttraccessService: Connecting to %s:%d\n", serverHostname.c_str(), serverPort);

    disconnect(); // Ensure clean state

    lastConnectionAttempt = millis();
    connecting = true;

    // Step 1: TCP connection test
    setState(CONNECTING_TCP, "Testing TCP connection...");
    if (!checkTCPConnection())
    {
        connecting = false;
        return false;
    }

    // Step 2: WebSocket connection
    setState(CONNECTING_WEBSOCKET, "Establishing WebSocket...");
    if (!establishWebSocketConnection())
    {
        connecting = false;
        return false;
    }

    setState(CONNECTED, "WebSocket connected");
    connecting = false;

    // Step 3: Authentication
    if (!deviceId.isEmpty() && !authToken.isEmpty())
    {
        setState(AUTHENTICATING, "Authenticating...");

        JsonDocument authDoc;
        authDoc["event"] = "EVENT";
        authDoc["data"]["type"] = "AUTHENTICATE";
        authDoc["data"]["payload"]["id"] = deviceId;
        authDoc["data"]["payload"]["token"] = authToken;

        if (!sendJSONMessage(authDoc.as<JsonObject>()))
        {
            Serial.println("AttraccessService: Failed to send authentication");
            setState(ERROR_FAILED, "Authentication send failed");
            return false;
        }

        Serial.println("AttraccessService: Authentication request sent");
    }
    else
    {
        // New device - register
        registerDevice();
    }

    return true;
}

void AttraccessService::disconnect()
{
    if (wsClient.connected())
    {
        wsClient.stop();
    }
    tcpClient.stop();

    authenticated = false;
    connecting = false;
    readerName = ""; // Clear reader name on disconnect

    setState(DISCONNECTED, "Disconnected");
}

bool AttraccessService::checkTCPConnection()
{
    tcpClient.stop(); // Ensure clean state

    Serial.printf("AttraccessService: Testing TCP connection to %s:%d\n",
                  serverHostname.c_str(), serverPort);

    if (!tcpClient.connect(serverHostname.c_str(), serverPort))
    {
        Serial.println("AttraccessService: TCP connection failed");
        setState(ERROR_FAILED, "TCP connection failed");
        return false;
    }

    Serial.println("AttraccessService: TCP connection successful");
    return true;
}

bool AttraccessService::establishWebSocketConnection()
{
    Serial.printf("AttraccessService: Connecting WebSocket to %s:%d\n",
                  serverHostname.c_str(), serverPort);

    // Set protocol before connecting
    wsClient.protocol = "ws";

    // Connect to WebSocket - library handles the upgrade automatically
    bool connected = wsClient.connect(serverHostname.c_str(), serverPort);

    if (!connected)
    {
        Serial.println("AttraccessService: WebSocket connection failed");
        setState(ERROR_FAILED, "WebSocket connection failed");
        return false;
    }

    Serial.println("AttraccessService: WebSocket connection established");
    return true;
}

void AttraccessService::registerDevice()
{
    Serial.println("AttraccessService: Registering new device...");

    setState(AUTHENTICATING, "Registering device...");

    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "REGISTER";
    doc["data"]["payload"]["deviceType"] = String("ESP32_CYD").c_str();

    if (sendJSONMessage(doc.as<JsonObject>()))
    {
        Serial.println("AttraccessService: Registration request sent");
    }
    else
    {
        Serial.println("AttraccessService: Failed to send registration");
        setState(ERROR_FAILED, "Registration send failed");
    }
}

void AttraccessService::processIncomingMessage(const String &message)
{
    Serial.printf("AttraccessService: Received: %s\n", message.c_str());

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, message);

    if (error)
    {
        Serial.printf("AttraccessService: JSON parse error: %s\n", error.c_str());
        return;
    }

    String event = doc["event"];
    JsonObject data = doc["data"];
    String type = data["type"];

    if (event == "RESPONSE")
    {
        handleResponseEvent(type, data);
    }
    else if (event == "EVENT")
    {
        handleEventType(type, data);
    }
    else if (event == "HEARTBEAT")
    {
        handleHeartbeatEvent();
    }
}

// --- Private handler methods ---

void AttraccessService::setNFC(NFC *nfc)
{
    Serial.printf("[DEBUG] setNFC called with nfc=%p\n", nfc);

    this->nfc = nfc;
}

void AttraccessService::handleResponseEvent(const String &type, const JsonObject &data)
{
    if (type == "REGISTER")
    {
        handleRegistration(data);
    }
    else if (type == "READER_AUTHENTICATED")
    {
        handleAuthentication(data);
    }
}

void AttraccessService::handleEventType(const String &type, const JsonObject &data)
{
    if (type == "UNAUTHORIZED")
    {
        handleUnauthorizedEvent();
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
    else if (type == "ENABLE_CARD_CHECKING")
    {
        handleEnableCardCheckingEvent(data);
    }
    else if (type == "DISABLE_CARD_CHECKING")
    {
        LEDService::waitForNFCTap = LEDService::WAIT_FOR_NFC_TAP_NONE;
        handleDisableCardCheckingEvent();
    }
    else if (type == "FIRMWARE_UPDATE_REQUIRED")
    {
        handleFirmwareUpdateRequired(data);
    }
    else if (type == "FIRMWARE_INFO")
    {
        onRequestFirmwareInfo();
    }
    else if (type == "CHANGE_KEYS")
    {
        this->onChangeKeysEvent(data);
    }
    else if (type == "AUTHENTICATE")
    {
        this->onAuthenticateNfcEvent(data);
    }
    else if (type == "SHOW_TEXT")
    {
        this->handleShowTextEvent(data);
    }

    if (type == "SELECT_ITEM")
    {
        LEDService::waitForResourceSelection = true;
        this->handleSelectItemEvent(data);
    }
    else
    {
        LEDService::waitForResourceSelection = false;
    }
}

// --- New: handle SELECT_ITEM event ---
void AttraccessService::handleSelectItemEvent(const JsonObject &data)
{
    if (!selectItemCallback)
    {
        Serial.println("AttraccessService: Received SELECT_ITEM event but no callback set");
        return;
    }

    if (!data["payload"])
    {
        Serial.println("AttraccessService: Received SELECT_ITEM event but no payload");
        return;
    }

    String label = data["payload"]["label"].as<String>();
    JsonArray options = data["payload"]["options"].as<JsonArray>();
    selectItemCallback(label, options);
}

void AttraccessService::setSelectItemCallback(SelectItemCallback cb)
{
    selectItemCallback = cb;
}

void AttraccessService::handleHeartbeatEvent()
{
    // Server heartbeat received - respond
    JsonDocument heartbeatResponse;
    heartbeatResponse["event"] = "HEARTBEAT";
    sendJSONMessage(heartbeatResponse.as<JsonObject>());
}

void AttraccessService::handleUnauthorizedEvent()
{
    Serial.println("AttraccessService: Received UNAUTHORIZED - clearing credentials and re-registering");
    // Clear invalid credentials
    deviceId = "";
    authToken = "";
    readerName = ""; // Clear reader name on unauthorized
    saveCredentials();
    authenticated = false;

    // Force UI update to clear reader name
    if (stateCallback)
    {
        Serial.println("AttraccessService: UNAUTHORIZED - forcing UI update to clear reader name");
        stateCallback(currentState, "Unauthorized - clearing credentials");
    }

    // Try registering again
    registerDevice();
}

void AttraccessService::handleDisplayErrorEvent(const JsonObject &data)
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

void AttraccessService::handleClearErrorEvent()
{
    if (mainContentCallback)
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_NONE;
        mainContentCallback(content);
    }
}

void AttraccessService::handleDisplaySuccessEvent(const JsonObject &data)
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

void AttraccessService::handleClearSuccessEvent()
{
    if (mainContentCallback)
    {
        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_NONE;
        mainContentCallback(content);
    }
}

void AttraccessService::handleShowTextEvent(const JsonObject &data)
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

void AttraccessService::handleEnableCardCheckingEvent(const JsonObject &data)
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
            content.message = resourceName + "\n\n" + "Tap to start using";
            content.textColor = 0x4CAF50; // Green (usage start)
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
        Serial.printf("AttraccessService: Unknown payload type: %s\n", payload["type"].as<String>().c_str());
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

void AttraccessService::handleDisableCardCheckingEvent()
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

void AttraccessService::handleFirmwareUpdateRequired(const JsonObject &data)
{
    if (mainContentCallback)
    {
        String currentVersion = data["payload"]["current"]["version"].as<String>();
        String availableVersion = data["payload"]["available"]["version"].as<String>();
        String url = data["payload"]["firmware"]["flashz"].as<String>();

        // test if url is set
        if (!url.isEmpty())
        {
            Serial.printf("AttraccessService: Firmware update required - downloading from %s\n", url.c_str());
            fz.fetch_async(url.c_str());

            MainScreenUI::MainContent content;
            content.type = MainScreenUI::CONTENT_ERROR;
            content.message = String("Downloading and installing firmware...") + "\n\n" + "Current: " + currentVersion + "\n" + "Available: " + availableVersion;
            mainContentCallback(content);
            return;
        }
        else
        {
            Serial.println("AttraccessService: Firmware update required but no url set");
        }

        MainScreenUI::MainContent content;
        content.type = MainScreenUI::CONTENT_ERROR;
        content.message = String("Firmware Update required") + "\n\n" + "Current: " + currentVersion + "\n" + "Available: " + availableVersion;
        mainContentCallback(content);
    }
}

void AttraccessService::handleRegistration(const JsonObject &data)
{
    // Check if payload contains id and token (indicates success)
    if (data["payload"]["id"] && data["payload"]["token"])
    {
        deviceId = data["payload"]["id"].as<String>();
        authToken = data["payload"]["token"].as<String>();

        Serial.printf("AttraccessService: Registration successful - ID: %s\n", deviceId.c_str());

        saveCredentials();
        authenticated = true;
        setState(AUTHENTICATED, "Device registered and authenticated");
    }
    else
    {
        String errorMsg = data["message"] | "Registration failed";
        Serial.printf("AttraccessService: Registration failed: %s\n", errorMsg.c_str());
        setState(ERROR_FAILED, errorMsg);
    }
}

void AttraccessService::handleAuthentication(const JsonObject &data)
{
    // READER_AUTHENTICATED response contains a "name" field on success
    if (data["payload"]["name"])
    {
        readerName = data["payload"]["name"].as<String>();
        Serial.printf("AttraccessService: Authentication successful - Reader name: %s\n", readerName.c_str());
        authenticated = true;

        // Always call setState, but also force callback if we're already authenticated
        // to ensure UI is updated with the latest reader name
        ConnectionState oldState = currentState;
        setState(AUTHENTICATED, "Authenticated");

        // If state didn't change (we were already authenticated), manually trigger callback
        // to ensure UI gets updated with the new reader name
        if (oldState == AUTHENTICATED && stateCallback)
        {
            Serial.println("AttraccessService: Reauthentication detected - forcing UI update");
            stateCallback(AUTHENTICATED, "Reauthenticated");
        }
    }
    else
    {
        String errorMsg = data["message"] | data["error"] | "Authentication failed";
        Serial.printf("AttraccessService: Authentication failed: %s\n", errorMsg.c_str());

        // Clear invalid credentials and try registering again
        deviceId = "";
        authToken = "";
        readerName = ""; // Clear reader name on auth failure
        saveCredentials();

        // Force UI update to clear reader name even if state doesn't change
        if (stateCallback)
        {
            Serial.println("AttraccessService: Authentication failed - forcing UI update to clear reader name");
            stateCallback(currentState, errorMsg);
        }

        registerDevice();
    }
}

void AttraccessService::sendHeartbeat()
{
    JsonDocument doc;
    doc["event"] = "HEARTBEAT";

    if (sendJSONMessage(doc.as<JsonObject>()))
    {
        lastHeartbeat = millis();
    }
}

bool AttraccessService::sendMessage(const String &eventType, const JsonObject &data)
{
    if (!isAuthenticated())
    {
        Serial.println("AttraccessService: Cannot send message - not authenticated");
        return false;
    }

    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = eventType;
    doc["data"]["payload"] = data;

    return sendJSONMessage(doc.as<JsonObject>());
}

bool AttraccessService::sendJSONMessage(const JsonObject &messageObj)
{
    if (!wsClient.connected())
    {
        Serial.println("AttraccessService: Cannot send - WebSocket not connected");
        return false;
    }

    String jsonString;
    serializeJson(messageObj, jsonString);

    if (jsonString.length() > 1024)
    {
        Serial.println("AttraccessService: Message too large (>1024 bytes)");
        return false;
    }

    Serial.printf("AttraccessService: Sending: %s\n", jsonString.c_str());

    // Send JSON message via WebSocket
    size_t bytesWritten = wsClient.write((uint8_t *)jsonString.c_str(), jsonString.length());
    wsClient.flush();

    if (bytesWritten != jsonString.length())
    {
        Serial.printf("AttraccessService: Write error - expected %d, wrote %d\n",
                      jsonString.length(), bytesWritten);
        return false;
    }

    return true;
}

void AttraccessService::setServerConfig(const String &hostname, uint16_t port)
{
    serverHostname = hostname;
    serverPort = port;
    configValid = !hostname.isEmpty() && port > 0 && port <= 65535;

    Serial.printf("AttraccessService: Server config updated - %s:%d (valid: %s)\n",
                  hostname.c_str(), port, configValid ? "yes" : "no");
}

bool AttraccessService::hasValidConfig() const
{
    return configValid;
}

bool AttraccessService::isConnected()
{
    return currentState >= CONNECTED && wsClient.connected();
}

bool AttraccessService::isAuthenticated()
{
    return authenticated && isConnected();
}

String AttraccessService::getConnectionStateString() const
{
    switch (currentState)
    {
    case DISCONNECTED:
        return "Disconnected";
    case CONNECTING_TCP:
        return "Connecting TCP...";
    case CONNECTING_WEBSOCKET:
        return "Connecting WebSocket...";
    case CONNECTED:
        return "Connected";
    case AUTHENTICATING:
        return "Authenticating...";
    case AUTHENTICATED:
        return "Authenticated";
    case ERROR_FAILED:
        return "Connection Failed";
    case ERROR_TIMED_OUT:
        return "Connection Timeout";
    case ERROR_INVALID_SERVER:
        return "Invalid Server";
    default:
        return "Unknown";
    }
}

void AttraccessService::setState(ConnectionState newState, const String &message)
{
    if (currentState != newState)
    {
        ConnectionState oldState = currentState;
        currentState = newState;
        lastStateChange = millis();

        Serial.printf("AttraccessService: State change %d -> %d: %s\n",
                      oldState, newState, message.c_str());

        if (stateCallback)
        {
            stateCallback(newState, message);
        }
    }
}

void AttraccessService::loadCredentials()
{
    deviceId = preferences.getString("deviceId", "");
    authToken = preferences.getString("authToken", "");

    if (!deviceId.isEmpty())
    {
        Serial.printf("AttraccessService: Loaded device ID: %s\n", deviceId.c_str());
    }
}

void AttraccessService::saveCredentials()
{
    preferences.putString("deviceId", deviceId);
    preferences.putString("authToken", authToken);
    Serial.println("AttraccessService: Credentials saved");
}

String AttraccessService::generateDeviceId()
{
    return "ESP32_" + WiFi.macAddress();
}

bool AttraccessService::isRateLimited() const
{
    return millis() - lastConnectionAttempt < CONNECTION_RETRY_INTERVAL;
}

void AttraccessService::onNFCTapped(const uint8_t *uid, uint8_t uidLength)
{
    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "NFC_TAP";

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
    doc["data"]["payload"]["cardUID"] = uidHex;

    this->sendJSONMessage(doc.as<JsonObject>());
}

void AttraccessService::onRequestFirmwareInfo()
{
    JsonDocument firmwareDoc;
    firmwareDoc["event"] = "RESPONSE";
    firmwareDoc["data"]["type"] = "FIRMWARE_INFO";
    firmwareDoc["data"]["payload"]["name"] = String(FIRMWARE_NAME).c_str();
    firmwareDoc["data"]["payload"]["variant"] = String(FIRMWARE_VARIANT).c_str();
    firmwareDoc["data"]["payload"]["version"] = FIRMWARE_VERSION;

    sendJSONMessage(firmwareDoc.as<JsonObject>());
}

void AttraccessService::hexStringToBytes(const String &hexString, uint8_t *byteArray, size_t byteArrayLength)
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

void AttraccessService::onChangeKeysEvent(const JsonObject &data)
{
    Serial.println("[API] CHANGE_KEYS");

    // Parse authentication key from hex string
    uint8_t authKey[16];
    String authKeyHex = data["payload"]["authenticationKey"].as<String>();
    this->hexStringToBytes(authKeyHex, authKey, sizeof(authKey));

    JsonObject response = JsonObject();
    response["failedKeys"] = JsonArray();
    response["successfulKeys"] = JsonArray();

    JsonDocument doc;
    JsonObject responsePayload = doc.to<JsonObject>();
    responsePayload["failedKeys"] = JsonArray();
    responsePayload["successfulKeys"] = JsonArray();

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

            Serial.println("Change Key Call 1");
            bool success = this->nfc->changeKey(0, authKey, newKey);
            if (!success)
            {
                responsePayload["failedKeys"].add(0);
                break;
            }

            responsePayload["successfulKeys"].add(0);

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
            responsePayload["successfulKeys"].add(keyNumber);
        }
        else
        {
            responsePayload["failedKeys"].add(keyNumber);
        }
    }

    doc["event"] = "RESPONSE";
    doc["data"]["type"] = "CHANGE_KEYS";
    doc["data"]["payload"] = responsePayload;

    this->sendJSONMessage(doc.as<JsonObject>());
}

void AttraccessService::onAuthenticateNfcEvent(const JsonObject &data)
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
    doc["data"]["type"] = "AUTHENTICATE";
    doc["data"]["payload"]["authenticationSuccessful"] = success;

    this->sendJSONMessage(doc.as<JsonObject>());
}

String AttraccessService::getHostname()
{
    return serverHostname;
}

uint16_t AttraccessService::getPort()
{
    return serverPort;
}

String AttraccessService::getDeviceId()
{
    return deviceId;
}