#include "api.hpp"

void API::task_function(void *pvParameters)
{
    API *api = (API *)pvParameters;

    const int LOOP_DELAY_MS = 10; // 10ms delay = ~100Hz update rate

    while (true)
    {
        api->loop();
        vTaskDelay(LOOP_DELAY_MS / portTICK_PERIOD_MS);
    }
}

void API::setup()
{
    Serial.println("[API] Setting up...");

    xTaskCreate(
        API::task_function,
        "API",
        4096,
        this,
        7,
        NULL);

    Serial.println("[API] Setup complete.");
}

void API::onRegistrationData(JsonObject data)
{
    Serial.println("[API] Received registration response.");

    if (data["payload"].is<JsonObject>())
    {
        auto payload = data["payload"].as<JsonObject>();
        if (payload["id"].is<uint32_t>() && payload["token"].is<String>())
        {
            uint32_t readerId = payload["id"].as<uint32_t>();
            String apiKey = payload["token"].as<String>();

            Settings::saveAttraccessAuthConfig(apiKey, readerId);

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
    Settings::clearAttraccessAuthConfig();

    if (this->apiConnectionStatusChangedHandler)
    {
        this->apiConnectionStatusChangedHandler(false);
    }
}

void API::onEnableCardChecking(JsonObject data)
{
    Serial.println("[API] ENABLE_CARD_CHECKING");
    if (this->enableNfcCardCheckingHandler)
    {
        this->enableNfcCardCheckingHandler();
    }

    // {"type":"reset-nfc-card","card":{"id":5},"user":{"id":2,"username":"jappy"}}
    if (data["payload"]["type"].as<String>() == "reset-nfc-card")
    {
        JsonObject card = data["payload"]["card"].as<JsonObject>();
        uint32_t cardId = card["id"].as<uint32_t>();
        JsonObject user = data["payload"]["user"].as<JsonObject>();
        String username = user["username"].as<String>();

        String displayText = "Reset NFC card\nUser > " + username + " <\nCard > " + String(cardId) + " <";
        if (this->displayNfcTapEnabledHandler)
        {
            this->displayNfcTapEnabledHandler(true, displayText);
        }
    }
    else if (data["payload"]["type"].as<String>() == "enroll-nfc-card")
    {
        JsonObject user = data["payload"]["user"].as<JsonObject>();
        String username = user["username"].as<String>();

        String displayText = "Enroll NFC card\nUser > " + username + " <";
        if (this->displayNfcTapEnabledHandler)
        {
            this->displayNfcTapEnabledHandler(true, displayText);
        }
    }
    else if (data["payload"]["type"].as<String>() == "toggle-resource-usage")
    {
        JsonObject resource = data["payload"]["resource"].as<JsonObject>();
        String resourceName = resource["name"].as<String>();

        // Check if there's an active usage session
        bool isActive = data["payload"]["isActive"].as<bool>();
        if (isActive)
        {
            if (this->displayNfcTapEnabledHandler)
            {
                this->displayNfcTapEnabledHandler(true, "Tap card to stop: " + resourceName);
            }
        }
        else
        {
            // Check for active maintenance
            bool hasMaintenance = data["payload"]["hasActiveMaintenance"].as<bool>();
            if (hasMaintenance)
            {
                if (this->displayNfcTapEnabledHandler)
                {
                    this->displayNfcTapEnabledHandler(true, "Maintenance mode - Tap to start: " + resourceName);
                }
            }
            else
            {
                if (this->displayNfcTapEnabledHandler)
                {
                    this->displayNfcTapEnabledHandler(true, "Tap card to start: " + resourceName);
                }
            }
        }
    }
    else
    {
        if (this->displayNfcTapEnabledHandler)
        {
            this->displayNfcTapEnabledHandler(true, data["payload"]["message"].as<String>());
        }
    }
}

void API::onDisableCardChecking(JsonObject data)
{
    Serial.println("[API] DISABLE_CARD_CHECKING");
    if (this->disableNfcCardCheckingHandler)
    {
        this->disableNfcCardCheckingHandler();
    }

    if (this->displayNfcTapEnabledHandler)
    {
        this->displayNfcTapEnabledHandler(false, "");
    }
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

    if (!this->nfcChangeKeyHandler)
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

    bool success = this->nfcChangeKeyHandler(keyNumber, authKey, oldKey, newKey);
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

void API::onNfcAuthenticate(JsonObject data)
{
    Serial.println("[API] AUTHENTICATE");

    uint8_t authenticationKey[16];
    String authKeyHex = data["payload"]["authenticationKey"].as<String>();
    this->hexStringToBytes(authKeyHex, authenticationKey, sizeof(authenticationKey));

    uint8_t keyNumber = data["payload"]["keyNumber"].as<uint8_t>();

    if (!this->nfcAuthenticateHandler)
    {
        Serial.println("[API] onNfcAuthenticate callback is not set");
        return;
    }

    bool success = this->nfcAuthenticateHandler(keyNumber, authenticationKey);
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

void API::onShowText(JsonObject data)
{
    Serial.println("[API] SHOW_TEXT");

    // Handle the payload structure correctly (single message field)
    if (data["payload"]["message"].is<String>())
    {
        if (this->showTextHandler)
        {
            this->showTextHandler(data["payload"]["message"].as<String>(), "");
        }
    }
    else
    {
        // Fallback for line-based messages
        if (this->showTextHandler)
        {
            this->showTextHandler(
                data["payload"]["lineOne"].as<String>(),
                data["payload"]["lineTwo"].as<String>());
        }
    }
}

void API::processMessage(String message)
{
    JsonDocument doc;
    deserializeJson(doc, message);

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
        this->onReaderAuthenticated(data);
    }
    else if (eventType == "READER_REQUEST_AUTHENTICATION")
    {
        this->onRequestAuthentication(data);
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
        this->onNfcAuthenticate(data);
    }

    else if (eventType == "DISPLAY_SUCCESS")
    {
        String message = data["payload"]["message"].as<String>();
        if (this->displaySuccessHandler)
        {
            this->displaySuccessHandler(message);
        }
    }
    else if (eventType == "DISPLAY_ERROR")
    {
        String message = data["payload"]["message"].as<String>();

        if (this->displayErrorHandler)
        {
            this->displayErrorHandler(message);
        }
    }
    else if (eventType == "DISPLAY_TEXT")
    {
        this->onShowText(data);
    }

    else if (eventType == "SELECT_ITEM")
    {
        this->is_in_select_item_mode = true;
        this->select_item_current_value = "";

        this->select_item_type = data["payload"]["itemType"].as<String>();
        // options array is array of objects with id and label
        this->select_item_options = data["payload"]["options"].as<JsonArray>();

        if (this->displaySelectItemHandler)
        {
            this->displaySelectItemHandler(this->select_item_type, this->select_item_options, this->select_item_current_value);
        }
    }
    else if (eventType == "CONFIRM_ACTION")
    {
        this->onConfirmAction(data);
    }
    else
    {
        Serial.println("[API] Unknown event type: " + eventType);
        Serial.println(payloadString);
    }
}

bool API::isRegistered()
{
    return (Settings::getAttraccessAuthConfig().apiKey.length() > 0);
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
    if (this->sendMessageHandler)
    {
        this->sendMessageHandler(json);
    }
}

void API::onRequestAuthentication(JsonObject data)
{
    if (!this->isRegistered())
    {
        Serial.println("[API] Not registered, sending registration request");
        this->sendMessage(true, "READER_REGISTER");
        return;
    }

    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["id"] = Settings::getAttraccessAuthConfig().readerId;
    payload["token"] = Settings::getAttraccessAuthConfig().apiKey;
    this->sendMessage(true, "READER_REQUEST_AUTHENTICATION", payload);
}

void API::onNFCTapped(char *uid, uint8_t uidLength)
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
    if (this->sendMessageHandler)
    {
        this->sendMessageHandler(json);
    }

    this->heartbeat_sent_at = millis();
}

void API::loop()
{
    if (!this->loop_is_enabled)
    {
        return;
    }

    this->sendHeartbeat();
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

    if (this->firmwareUpdateRequiredHandler)
    {
        this->firmwareUpdateRequiredHandler();
    }
}

void API::onFirmwareStreamChunk(JsonObject data)
{
    Serial.println("[API] Received firmware stream chunk");

    if (this->firmwareStreamChunkHandler)
    {
        this->firmwareStreamChunkHandler(data);
    }
}

void API::setOnEnableNfcCardChecking(void (*callback)())
{
    this->enableNfcCardCheckingHandler = callback;
}

void API::setOnDisableNfcCardChecking(void (*callback)())
{
    this->disableNfcCardCheckingHandler = callback;
}

void API::setOnNfcChangeKey(bool (*callback)(uint8_t keyNumber, uint8_t *authKey, uint8_t *oldKey, uint8_t *newKey))
{
    this->nfcChangeKeyHandler = callback;
}

void API::setOnNfcAuthenticate(bool (*callback)(uint8_t keyNumber, uint8_t *authenticationKey))
{
    this->nfcAuthenticateHandler = callback;
}

void API::setLoopIsEnabled(bool enabled)
{
    this->heartbeat_sent_at = 0;
    this->is_in_select_item_mode = false;
    this->select_item_current_value = "";
    this->select_item_type = "";
    this->select_item_options = JsonArray();
    this->loop_is_enabled = enabled;
}

void API::setOnApiConnectionStatusChanged(void (*callback)(bool isAuthenticated))
{
    this->apiConnectionStatusChangedHandler = callback;
}

void API::setDisplayNfcTapEnabledHandler(void (*callback)(bool enabled, String text))
{
    this->displayNfcTapEnabledHandler = callback;
}

void API::setShowTextHandler(void (*callback)(String lineOne, String lineTwo))
{
    this->showTextHandler = callback;
}

void API::setDeviceNameChangedHandler(void (*callback)(String deviceName))
{
    this->deviceNameChangedHandler = callback;
}

void API::setDisplaySuccessHandler(void (*callback)(String message))
{
    this->displaySuccessHandler = callback;
}

void API::setDisplayErrorHandler(void (*callback)(String message))
{
    this->displayErrorHandler = callback;
}

void API::setDisplaySelectItemHandler(void (*callback)(String type, JsonArray options, String value))
{
    this->displaySelectItemHandler = callback;
}

void API::setOnFirmwareUpdateRequiredHandler(void (*callback)())
{
    this->firmwareUpdateRequiredHandler = callback;
}

void API::setOnFirmwareStreamChunkHandler(void (*callback)(JsonObject data))
{
    this->firmwareStreamChunkHandler = callback;
}

void API::setSendMessageHandler(void (*callback)(String message))
{
    this->sendMessageHandler = callback;
}

void API::onKeyPressed(char key)
{
    if (key == '\0')
    {
        return;
    }

    if (!this->is_in_select_item_mode)
    {
        return;
    }

    if (key == '#')
    {
        JsonObject payload = JsonObject();
        payload["value"] = this->select_item_current_value;
        this->sendMessage(false, "SELECT_ITEM", payload);
        this->is_in_select_item_mode = false;
        return;
    }
    else if (key == 'D')
    {
        this->select_item_current_value = "";
    }
    else
    {
        this->select_item_current_value += key;
    }

    if (this->displaySelectItemHandler)
    {
        this->displaySelectItemHandler(this->select_item_type, this->select_item_options, this->select_item_current_value);
    }
}

void API::onConfirmAction(JsonObject data)
{
    Serial.println("[API] CONFIRM_ACTION");

    String title = "Confirm";
    String message = "> not sure what... <";

    if (data["payload"]["type"].as<String>() == "toggle-resource-usage")
    {
        String resourceName = data["payload"]["resource"]["name"].as<String>();
        bool isActive = data["payload"]["isActive"].as<bool>();

        if (isActive)
        {
            title = "Stop " + resourceName;
            message = "Confirm with \"#\"";
        }
        else
        {
            title = "Start " + resourceName;
            message = "Confirm with \"#\"";
        }
    }
    else
    {
        Serial.println("UNSUPPORTED CONFIRM ACTION");
    }

    if (this->confirmActionHandler)
    {
        this->confirmActionHandler(title, message);
    }
}

void API::setDisplayConfirmActionHandler(void (*callback)(String title, String message))
{
    this->confirmActionHandler = callback;
}

void API::onReaderAuthenticated(JsonObject data)
{
    Serial.println("[API] READER_AUTHENTICATED");

    String deviceName = data["payload"]["name"].as<String>();

    if (this->apiConnectionStatusChangedHandler)
    {
        this->apiConnectionStatusChangedHandler(true);
    }

    if (this->deviceNameChangedHandler)
    {
        this->deviceNameChangedHandler(deviceName);
    }

    Serial.println("[API] Authentication successful.");
}