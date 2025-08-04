#include "api.hpp"

void API::task_function(void *pvParameters)
{
    API *api = (API *)pvParameters;

    while (true)
    {
        api->loop();
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void API::setup()
{
    Serial.println("[API] Setting up...");

    xTaskCreate(
        task_function,
        "API",
        4096,
        this,
        10,
        &task_handle);

    Serial.println("[API] Setup complete.");
}

bool API::isConfigured()
{
    String hostname = Persistence::getSettings().Config.api.hostname;
    int port = Persistence::getSettings().Config.api.port;

    // Check if hostname is set and not empty
    if (hostname.length() == 0 || port == 0)
    {
        return false;
    }

    return true;
}

bool API::checkTCPConnection()
{
    String hostname = Persistence::getSettings().Config.api.hostname;
    int port = Persistence::getSettings().Config.api.port;

    // Only print once per connection attempt
    if (!is_connecting)
    {
        Serial.println("[API] Checking TCP connection to " + hostname + ":" + String(port));
        is_connecting = true;
    }

    int connectStatus = this->client.connect(
        hostname.c_str(),
        port);

    if (connectStatus == 1)
    {
        is_connecting = false;
        return true;
    }

    // Only print detailed error if this is a new failure, not repeated failures
    if (millis() - last_connection_attempt >= connection_retry_interval)
    {
        Serial.print("[API] Failed to establish TCP connection. Status: ");
        Serial.print(connectStatus);
        Serial.print(" (");
        switch (connectStatus)
        {
        case 0:
            Serial.print("FAILED");
            break;
        case -1:
            Serial.print("TIMED_OUT");
            break;
        case -2:
            Serial.print("INVALID_SERVER");
            break;
        case -3:
            Serial.print("TRUNCATED");
            break;
        case -4:
            Serial.print("INVALID_RESPONSE");
            break;
        case -5:
            Serial.print("DOMAIN_NOT_FOUND");
            break;
        default:
            Serial.print("UNKNOWN_ERROR");
            break;
        }
        Serial.println(")");
    }

    is_connecting = false;
    return false;
}

bool API::isConnected()
{
    bool was_connected = this->is_connected;

    // Check if API is configured before attempting connection
    if (!isConfigured())
    {
        if (was_connected)
        {
            Serial.println("[API] Not configured, skipping connection attempts");
            this->is_connected = false;
            this->display->set_api_connected(false);
        }
        return false;
    }

    this->is_connected = this->websocket.connected();

    if (was_connected != this->is_connected)
    {
        if (!this->is_connected)
        {
            Serial.println("[API] Socket not connected to server: " + String(Persistence::getSettings().Config.api.hostname) + ":" + String(Persistence::getSettings().Config.api.port) + API_WS_PATH);
        }

        if (this->is_connected)
        {
            Serial.println("[API] Socket connected to server: " + String(Persistence::getSettings().Config.api.hostname) + ":" + String(Persistence::getSettings().Config.api.port) + API_WS_PATH);
        }
    }

    if (this->is_connected)
    {
        return true;
    }
    else
    {
        this->display->set_api_connected(false);
    }

    this->is_authenticated = false;
    this->authentication_sent_at = 0;
    this->registration_sent_at = 0;

    // Rate limit connection attempts
    unsigned long current_time = millis();
    if (current_time - last_connection_attempt < connection_retry_interval)
    {
        return false;
    }

    last_connection_attempt = current_time;

    bool tcp_connected = this->checkTCPConnection();

    if (!tcp_connected)
    {
        this->display->set_api_connected(false);
        return false;
    }

    Serial.println("[API] Connecting to WebSocket...");
    this->websocket.protocol = "ws";
    this->is_connected = this->websocket.connect(
        Persistence::getSettings().Config.api.hostname,
        Persistence::getSettings().Config.api.port);

    if (this->is_connected)
    {
        Serial.println("[API] WS connection to " + String(Persistence::getSettings().Config.api.hostname) + ":" + String(Persistence::getSettings().Config.api.port) + " established");
    }

    if (!this->is_connected)
    {
        this->display->set_api_connected(false);
    }

    return this->is_connected;
}

void API::onRegistrationData(JsonObject data)
{
    Serial.println("[API] Received registration response.");

    // Extract and save registration info
    if (data["payload"].is<JsonObject>())
    {
        auto payload = data["payload"].as<JsonObject>();
        if (payload["id"].is<uint32_t>() && payload["token"].is<String>())
        {
            uint32_t readerId = payload["id"].as<uint32_t>();
            String apiKey = payload["token"].as<String>();

            // Save to persistence
            PersistSettings<PersistenceData> settings = Persistence::getSettings();
            settings.Config.api.readerId = readerId;
            strncpy(settings.Config.api.apiKey, apiKey.c_str(), sizeof(settings.Config.api.apiKey) - 1);
            settings.Config.api.apiKey[sizeof(settings.Config.api.apiKey) - 1] = '\0'; // Ensure null termination
            settings.Config.api.has_auth = true;
            Persistence::saveSettings(settings);

            Serial.print("[API] Reader registered with ID: ");
            Serial.print(readerId);
            Serial.print(" and token: ");
            Serial.println(apiKey);
        }
    }
}

void API::onUnauthorized(JsonObject data)
{
    String message = "Unknown error";
    if (data["payload"].is<JsonObject>())
    {
        JsonObject payload = data["payload"].as<JsonObject>();
        if (payload["message"].is<String>() && !payload["message"].isNull())
        {
            message = payload["message"].as<String>();
        }
    }

    Serial.println("[API] UNAUTHORIZED: " + message);
    this->is_authenticated = false;
    this->authentication_sent_at = 0;
    this->registration_sent_at = 0;
    PersistSettings<PersistenceData> settings = Persistence::getSettings();
    settings.Config.api.has_auth = false;
    Persistence::saveSettings(settings);
    this->display->set_api_connected(false);
}

void API::onEnableCardChecking(JsonObject data)
{
    Serial.println("[API] ENABLE_CARD_CHECKING");
    if (this->onEnableNfcCardChecking)
    {
        this->onEnableNfcCardChecking();
    }

    // {"type":"reset-nfc-card","card":{"id":5},"user":{"id":2,"username":"jappy"}}
    if (data["payload"]["type"].as<String>() == "reset-nfc-card")
    {
        JsonObject card = data["payload"]["card"].as<JsonObject>();
        uint32_t cardId = card["id"].as<uint32_t>();
        JsonObject user = data["payload"]["user"].as<JsonObject>();
        String username = user["username"].as<String>();

        String displayText = "Reset NFC card\nUser > " + username + " <\nCard > " + String(cardId) + " <";
        this->display->set_nfc_tap_enabled(true, displayText);
    }
    else if (data["payload"]["type"].as<String>() == "enroll-nfc-card")
    {
        JsonObject user = data["payload"]["user"].as<JsonObject>();
        String username = user["username"].as<String>();

        String displayText = "Enroll NFC card\nUser > " + username + " <";
        this->display->set_nfc_tap_enabled(true, displayText);
    }
    else if (data["payload"]["type"].as<String>() == "toggle-resource-usage")
    {
        JsonObject resource = data["payload"]["resource"].as<JsonObject>();
        String resourceName = resource["name"].as<String>();

        // Check if there's an active usage session
        bool isActive = data["payload"]["isActive"].as<bool>();
        if (isActive)
        {
            this->display->set_nfc_tap_enabled(true, "Tap card to stop: " + resourceName);
        }
        else
        {
            // Check for active maintenance
            bool hasMaintenance = data["payload"]["hasActiveMaintenance"].as<bool>();
            if (hasMaintenance)
            {
                this->display->set_nfc_tap_enabled(true, "Maintenance mode - Tap to start: " + resourceName);
            }
            else
            {
                this->display->set_nfc_tap_enabled(true, "Tap card to start: " + resourceName);
            }
        }
    }
    else
    {
        this->display->set_nfc_tap_enabled(true, data["payload"]["message"].as<String>());
    }
}

void API::onDisableCardChecking(JsonObject data)
{
    Serial.println("[API] DISABLE_CARD_CHECKING");
    if (this->onDisableNfcCardChecking)
    {
        this->onDisableNfcCardChecking();
    }

    this->display->set_nfc_tap_enabled(false);
}

void API::hexStringToBytes(const String &hexString, uint8_t *byteArray, size_t byteArrayLength)
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

void API::onChangeKey(JsonObject data)
{
    Serial.println("[API] CHANGE_KEY");

    if (!this->onNfcChangeKey)
    {
        Serial.println("[API] onNfcChangeKey callback is not set");
        return;
    }

    uint8_t keyNumber = data["payload"]["keyNumber"].as<uint8_t>();
    String authKeyHex = data["payload"]["authKey"].as<String>();
    String oldKeyHex = data["payload"]["oldKey"].as<String>();
    String newKeyHex = data["payload"]["newKey"].as<String>();

    uint8_t newKey[16];
    this->hexStringToBytes(newKeyHex, newKey, sizeof(newKey));

    uint8_t oldKey[16];
    this->hexStringToBytes(oldKeyHex, oldKey, sizeof(oldKey));

    uint8_t authKey[16];
    this->hexStringToBytes(authKeyHex, authKey, sizeof(authKey));

    bool success = this->onNfcChangeKey(keyNumber, authKey, oldKey, newKey);
    if (success)
    {
        Serial.println("[API] Key change successful.");
    }
    else
    {
        Serial.println("[API] Key change failed.");
    }

    StaticJsonDocument<256> doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["successful"] = success;
    this->sendMessage(true, "NFC_CHANGE_KEY", payload);
}

void API::onAuthenticate(JsonObject data)
{
    Serial.println("[API] AUTHENTICATE");

    uint8_t authenticationKey[16];
    String authKeyHex = data["payload"]["authenticationKey"].as<String>();
    this->hexStringToBytes(authKeyHex, authenticationKey, sizeof(authenticationKey));

    uint8_t keyNumber = data["payload"]["keyNumber"].as<uint8_t>();

    if (!this->onNfcAuthenticate)
    {
        Serial.println("[API] onNfcAuthenticate callback is not set");
        return;
    }

    bool success = this->onNfcAuthenticate(keyNumber, authenticationKey);
    if (success)
    {
        Serial.println("[API] Authentication successful.");
    }
    else
    {
        Serial.println("[API] Authentication failed.");
    }

    StaticJsonDocument<256> doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["authenticationSuccessful"] = success;
    this->sendMessage(true, "NFC_AUTHENTICATE", payload);
}

void API::onReauthenticate(JsonObject data)
{
    Serial.println("[API] REAUTHENTICATE Api flow");
    this->authentication_sent_at = 0;
    this->is_authenticated = false;
}

void API::onShowText(JsonObject data)
{
    Serial.println("[API] SHOW_TEXT");

    // Handle the payload structure correctly (single message field)
    if (data["payload"]["message"].is<String>())
    {
        this->display->show_text(data["payload"]["message"].as<String>(), "");
    }
    else
    {
        // Fallback for line-based messages
        this->display->show_text(
            data["payload"]["lineOne"].as<String>(),
            data["payload"]["lineTwo"].as<String>());
    }
}

void API::processData()
{
    if (!this->websocket.available())
    {
        return;
    }

    uint8_t buffer[1024];
    const auto bytes_read = this->websocket.read(buffer, 1024);

    // parse json
    JsonDocument doc;
    deserializeJson(doc, buffer, bytes_read);

    auto data = doc["data"].as<JsonObject>();
    String eventType = data["type"].as<String>();
    auto payload = data["payload"].as<JsonObject>();

    String payloadString;
    serializeJson(payload, payloadString);

    Serial.println("[API] Received message of type " + eventType + " with payload " + payloadString);
    Serial.println("[API] Sending ACK for event " + eventType);
    this->sendAck(eventType.c_str());

    if (eventType == "READER_REGISTER")
    {
        this->onRegistrationData(data);
    }
    else if (eventType == "READER_UNAUTHORIZED")
    {
        this->onUnauthorized(data);
    }
    else if (eventType == "READER_AUTHENTICATED")
    {
        this->is_authenticated = true;
        this->display->set_api_connected(true);
        this->display->set_device_name(payload["name"].as<String>());
        Serial.println("[API] Authentication successful.");
    }
    else if (eventType == "NFC_ENABLE_CARD_CHECKING")
    {
        this->onEnableCardChecking(data);
    }
    else if (eventType == "NFC_DISABLE_CARD_CHECKING")
    {
        this->onDisableCardChecking(data);
    }
    else if (eventType == "NFC_CHANGE_KEY")
    {
        this->onChangeKey(data);
    }
    else if (eventType == "NFC_AUTHENTICATE")
    {
        this->onAuthenticate(data);
    }
    else if (eventType == "DISPLAY_SUCCESS")
    {
        String message = data["payload"]["message"].as<String>();
        this->display->show_success(message);
    }
    else if (eventType == "DISPLAY_ERROR")
    {
        String message = data["payload"]["message"].as<String>();

        this->display->show_error(message);
    }
    else if (eventType == "CLEAR_SUCCESS")
    {
        this->display->clear_success();
    }
    else if (eventType == "CLEAR_ERROR")
    {
        this->display->clear_error();
    }
    else if (eventType == "READER_AUTHENTICATE")
    {
        this->onReauthenticate(data);
    }
    else if (eventType == "SHOW_TEXT")
    {
        this->onShowText(data);
    }
    else if (eventType == "HIDE_TEXT")
    {
        this->display->clear_text();
    }
    else if (eventType == "SELECT_ITEM")
    {
        String label = data["payload"]["label"].as<String>();
        String value = data["payload"]["selectedValue"].as<String>();
        // options array is array of objects with id and label
        JsonArray options = data["payload"]["options"].as<JsonArray>();

        uint8_t amountOfOptions = options.size();

        String displayText = label + "\n" + "> " + value + " <";
        if (amountOfOptions > 1)
        {
            for (JsonObject option : options)
            {
                String optionLabel = option["label"].as<String>();
                String optionId = option["id"].as<String>();
                displayText += optionId + ": " + optionLabel + "\n";
            }
        }
        else
        {
            // first option
            String optionLabel = options[0]["label"].as<String>();
            displayText = optionLabel + "\n" + "Press '#' to scan card";
        }

        this->display->show_text(displayText, "");
    }
    else if (eventType == "CANCEL")
    {
        Serial.println("[API] CANCEL event received");
        this->display->clear_text();
        if (this->onDisableNfcCardChecking)
        {
            this->onDisableNfcCardChecking();
        }
        this->display->set_nfc_tap_enabled(false);
    }
    else if (eventType == "READER_FIRMWARE_INFO")
    {
        this->onFirmwareInfo(data);
    }
    else if (eventType == "READER_FIRMWARE_UPDATE_REQUIRED")
    {
        this->onFirmwareUpdateRequired(data);
    }
    else if (eventType == "READER_FIRMWARE_STREAM_CHUNK")
    {
        this->onFirmwareStreamChunk(data);
    }
    else
    {
        Serial.println("[API] Unknown event type: " + eventType);
        Serial.write(buffer, bytes_read);
        Serial.println();
    }
}

bool API::isRegistered()
{
    return (Persistence::getSettings().Config.api.has_auth);
}

void API::sendAck(const char *type)
{
    this->sendMessage(true, ("ACK_" + String(type)).c_str());
}

void API::sendMessage(bool is_response, const char *type)
{
    StaticJsonDocument<256> doc;
    JsonObject payload = doc.to<JsonObject>();
    this->sendMessage(is_response, type, payload);
}

void API::sendMessage(bool is_response, const char *type, JsonObject payload)
{
    JsonDocument event;
    if (is_response)
    {
        event["event"] = "RESPONSE";
    }
    else
    {
        event["event"] = "EVENT";
    }
    event["data"]["type"] = type;

    // Create a copy of the payload in the destination document
    JsonObject eventPayload = event["data"]["payload"].to<JsonObject>();
    for (JsonPair p : payload)
    {
        eventPayload[p.key()] = p.value();
    }

    String payloadString = event["data"]["payload"].as<String>();

    Serial.println("[API] Sending " + String(is_response ? "response" : "event") + " of type " + String(type) + " with payload " + payloadString);

    String json;
    serializeJson(event, json);
    this->websocket.write((uint8_t *)json.c_str(), json.length());
    this->websocket.flush();
}

void API::sendRegistrationRequest()
{
    // only send registration once per minute
    if (this->registration_sent_at != 0 && millis() - this->registration_sent_at < (1000 * 10))
    {
        return;
    }

    Serial.println("[API] Registering reader...");

    this->sendMessage(false, "READER_REGISTER");

    this->registration_sent_at = millis();

    // check write error / status
    auto writeStatus = this->websocket.getWriteError();
    if (writeStatus != 0)
    {
        Serial.print("[API] Failed to send registration request. Error: ");
        Serial.println(writeStatus);
        return;
    }

    Serial.println("[API] Registration request sent.");
}

void API::sendAuthenticationRequest()
{
    // only send authentication once per minute
    if (this->authentication_sent_at != 0 && millis() - this->authentication_sent_at < (1000 * 10))
    {
        return;
    }

    StaticJsonDocument<256> doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["id"] = Persistence::getSettings().Config.api.readerId;
    payload["token"] = Persistence::getSettings().Config.api.apiKey;
    this->sendMessage(false, "READER_AUTHENTICATE", payload);

    this->authentication_sent_at = millis();
}

void API::sendNFCTapped(char *uid, uint8_t uidLength)
{
    StaticJsonDocument<256> doc;
    JsonObject payload = doc.to<JsonObject>();

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

    payload["cardUID"] = uidHex;
    this->sendMessage(false, "NFC_TAP", payload);
}

void API::sendHeartbeat()
{
    // send every 5 seconds
    if (this->heartbeat_sent_at != 0 && millis() - this->heartbeat_sent_at < (1000 * 5))
    {
        return;
    }

    StaticJsonDocument<512> event;
    event["event"] = "HEARTBEAT";

    String json;
    serializeJson(event, json);
    this->websocket.write((uint8_t *)json.c_str(), json.length());
    this->websocket.flush();

    this->heartbeat_sent_at = millis();
}

void API::loop()
{
    if (!this->loop_is_enabled)
    {
        return;
    }

    // First check if API is configured
    if (!isConfigured())
    {
        // Skip all connection attempts if not configured
        return;
    }

    // Then check if we're connected
    if (!isConnected())
    {
        return;
    }

    if (!this->isRegistered())
    {
        this->sendRegistrationRequest();
    }
    else if (!this->is_authenticated)
    {
        this->sendAuthenticationRequest();
    }

    this->sendHeartbeat();
    this->processData();
    char key = this->keypad->readKey();
    if (key != '\0')
    {
        StaticJsonDocument<256> doc;
        JsonObject payload = doc.to<JsonObject>();
        payload["key"] = String(key);

        if (key == '#')
        {
            payload["key"] = String("CONFIRM");
        }

        if (key == 'D')
        {
            payload["key"] = String("DELETE");
        }

        this->sendMessage(false, "READER_KEY_PRESSED", payload);
    }
}

void API::onFirmwareInfo(JsonObject data)
{
    Serial.println("[API] Requested firmware info");

    JsonObject response = JsonObject();
    response["name"] = FIRMWARE_NAME;
    response["variant"] = FIRMWARE_VARIANT;
    response["version"] = FIRMWARE_VERSION;
    this->sendMessage(true, "READER_FIRMWARE_INFO", response);
}

void API::onFirmwareUpdateRequired(JsonObject data)
{
    Serial.println("[API] Firmware update required");

    // Show updating message on display
    this->display->show_text("Firmware Update", "Starting...");

    // Prepare response for firmware chunks
    StaticJsonDocument<256> doc;
    JsonObject responsePayload = doc.to<JsonObject>();
    responsePayload["ready"] = true;
    responsePayload["bytes_received"] = 0;
    this->sendMessage(true, "READER_FIRMWARE_UPDATE_REQUIRED", responsePayload);
}

void API::onFirmwareStreamChunk(JsonObject data)
{
    Serial.println("[API] Received firmware stream chunk");

    // Extract chunk information from the payload
    JsonObject payload = data["payload"].as<JsonObject>();

    // In a full implementation, this would handle the actual firmware chunk data
    // Since we're receiving binary data through a separate channel, we acknowledge receipt
}

void API::setOnEnableNfcCardChecking(void (*callback)())
{
    this->onEnableNfcCardChecking = callback;
}

void API::setOnDisableNfcCardChecking(void (*callback)())
{
    this->onDisableNfcCardChecking = callback;
}

void API::setOnNfcChangeKey(bool (*callback)(uint8_t keyNumber, uint8_t *authKey, uint8_t *oldKey, uint8_t *newKey))
{
    this->onNfcChangeKey = callback;
}

void API::setOnNfcAuthenticate(bool (*callback)(uint8_t keyNumber, uint8_t *authenticationKey))
{
    this->onNfcAuthenticate = callback;
}

void API::enableLoop()
{
    this->loop_is_enabled = true;
}

void API::disableLoop()
{
    this->loop_is_enabled = false;
}

bool API::isLoopEnabled()
{
    return this->loop_is_enabled;
}