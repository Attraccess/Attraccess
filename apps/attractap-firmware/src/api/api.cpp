#include "api.hpp"

void API::setup()
{
    xTaskCreate(taskFn, "API", 4096, this, TASK_PRIORITY_API, NULL);
}

void API::taskFn(void *parameter)
{
    API *api = (API *)parameter;
    while (true)
    {
        api->loop();
        vTaskDelay(20 / portTICK_PERIOD_MS);
    }
}

void API::updateSateInfo()
{
    uint32_t lastStateChangeTime = this->appState.getLastStateChangeTime();
    if (this->lastKnownAppStateChangeTime >= lastStateChangeTime)
    {
        return;
    }

    this->lastKnownAppStateChangeTime = lastStateChangeTime;

    auto websocketState = this->appState.getWebsocketState();
    auto networkState = this->appState.getNetworkState();

    this->loopIsEnabled = websocketState.connected && (networkState.wifi_connected || networkState.ethernet_connected);
}

void API::loop()
{
    this->updateSateInfo();
    // Always try to drain/process any available incoming messages
    this->processAvailableMessages();

    // Only send heartbeat when connection is usable
    if (this->loopIsEnabled)
    {
        this->sendHeartbeat();
    }
}

void API::onRegistrationData(JsonObject data)
{
    this->logger.info("Received registration response.");

    if (data["payload"].is<JsonObject>())
    {
        auto payload = data["payload"].as<JsonObject>();
        if (payload["id"].is<uint32_t>() && payload["token"].is<String>())
        {
            uint32_t readerId = payload["id"].as<uint32_t>();
            String apiKey = payload["token"].as<String>();

            Settings::saveAttraccessAuthConfig(apiKey, readerId);

            this->logger.infof("Reader registered with ID: %d and token: %s", readerId, apiKey.c_str());
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

    logger.error(("UNAUTHORIZED: " + message).c_str());
    Settings::clearAttraccessAuthConfig();

    this->appState.setApiState(false, "");
}

void API::onEnableCardChecking(JsonObject data)
{
    logger.info("ENABLE_CARD_CHECKING");

    // TODO: trigger nfc card checking

    // {"type":"reset-nfc-card","card":{"id":5},"user":{"id":2,"username":"jappy"}}
    if (data["payload"]["type"].as<String>() == "reset-nfc-card")
    {
        JsonObject card = data["payload"]["card"].as<JsonObject>();
        uint32_t cardId = card["id"].as<uint32_t>();
        JsonObject user = data["payload"]["user"].as<JsonObject>();
        String username = user["username"].as<String>();

        String displayText = "Reset NFC card\nUser > " + username + " <\nCard > " + String(cardId) + " <";
        logger.error("Reset NFC card not implemented");
        // TODO: trigger displaying of reset nfc card screen
    }
    else if (data["payload"]["type"].as<String>() == "enroll-nfc-card")
    {
        JsonObject user = data["payload"]["user"].as<JsonObject>();
        String username = user["username"].as<String>();

        String displayText = "Enroll NFC card\nUser > " + username + " <";
        logger.error("Enroll NFC card not implemented");
        // TODO: trigger displaying of enroll nfc card screen
    }
    else if (data["payload"]["type"].as<String>() == "toggle-resource-usage")
    {
        JsonObject resource = data["payload"]["resource"].as<JsonObject>();
        String resourceName = resource["name"].as<String>();

        // Check if there's an active usage session
        bool isActive = data["payload"]["isActive"].as<bool>();
        if (isActive)
        {
            logger.error("Toggle resource usage not implemented");
            // TODO: trigger displaying of toggle resource usage screen
        }
        else
        {
            // Check for active maintenance
            bool hasMaintenance = data["payload"]["hasActiveMaintenance"].as<bool>();
            if (hasMaintenance)
            {
                logger.error("Toggle resource usage not implemented");
                // TODO: trigger displaying of toggle resource usage screen
            }
            else
            {
                logger.error("Toggle resource usage not implemented");
                // TODO: trigger displaying of toggle resource usage screen
            }
        }
    }
    else
    {
        logger.error("Toggle resource usage not implemented");
        // TODO: trigger displaying of toggle resource usage screen
    }
}

void API::onDisableCardChecking(JsonObject data)
{
    logger.info("DISABLE_CARD_CHECKING");
    logger.error("Disable card checking not implemented");
    // TODO: trigger displaying of disable card checking screen and disable card checking
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
    logger.info("CHANGE_KEY");

    return;

    /*

    // TODO: implement change key

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
        logger.info("Key change successful.");
    }
    else
    {
        logger.error("Key change failed.");
    }

    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["successful"] = success;
    this->sendMessage(true, "NFC_CHANGE_KEY", payload);
    */
}

void API::onNfcAuthenticate(JsonObject data)
{
    logger.info("NFC AUTHENTICATE");

    return;

    /*
    // TODO: implement nfc authenticate

    uint8_t authenticationKey[16];
    String authKeyHex = data["payload"]["authenticationKey"].as<String>();
    this->hexStringToBytes(authKeyHex, authenticationKey, sizeof(authenticationKey));

    uint8_t keyNumber = data["payload"]["keyNumber"].as<uint8_t>();

    if (!this->nfcAuthenticateHandler)
    {
        logger.error("onNfcAuthenticate callback is not set");
        return;
    }

    bool success = this->nfcAuthenticateHandler(keyNumber, authenticationKey);
    if (success)
    {
        logger.info("NFC Authentication successful.");
    }
    else
    {
        logger.error("NFC Authentication failed.");
    }

    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["authenticationSuccessful"] = success;
    this->sendMessage(true, "NFC_AUTHENTICATE", payload);
    */
}

void API::onShowText(JsonObject data)
{
    logger.info("SHOW_TEXT");

    // Handle the payload structure correctly (single message field)
    if (data["payload"]["message"].is<String>())
    {
        logger.error("Show text not implemented");
        // TODO: trigger displaying of show text screen
    }
    else
    {
        // Fallback for line-based messages
        logger.error("Show text not implemented");
        // TODO: trigger displaying of show text screen
    }
}

void API::processAvailableMessages()
{
    String message;

    if (!State::getNextIncomingWebsocketMessage(message))
    {
        return;
    }

    JsonDocument doc;
    deserializeJson(doc, message);

    auto data = doc["data"].as<JsonObject>();
    String eventType = data["type"].as<String>();
    auto payload = data["payload"].as<JsonObject>();

    String payloadString;
    serializeJson(payload, payloadString);

    logger.info(("Received message of type " + eventType + " with payload " + payloadString).c_str());
    logger.info(("Sending ACK for event " + eventType).c_str());
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
        this->onDisplaySuccess(data);
    }
    else if (eventType == "DISPLAY_ERROR")
    {
        this->onDisplayError(data);
    }
    else if (eventType == "DISPLAY_TEXT")
    {
        this->onShowText(data);
    }

    else if (eventType == "SELECT_ITEM")
    {
        this->onSelectItem(data);
    }
    else if (eventType == "CONFIRM_ACTION")
    {
        this->onConfirmAction(data);
    }
    else
    {
        logger.error(("Unknown event type: " + eventType).c_str());
        logger.error(payloadString.c_str());
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
    JsonDocument doc;
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

    logger.debug(("Sending " + String(is_response ? "response" : "event") + " of type " + String(type) + " with payload " + payloadString).c_str());

    String json;
    serializeJson(event, json);

    this->logger.info(("pushing message to queue: " + json).c_str());
    this->appState.pushOutgoingWebsocketMessageToQueue(json);
}

void API::onRequestAuthentication(JsonObject data)
{
    if (!this->isRegistered())
    {
        logger.info("Not registered, sending registration request");
        this->sendMessage(true, "READER_REGISTER");
        return;
    }

    logger.info("Sending authentication request");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["id"] = Settings::getAttraccessAuthConfig().readerId;
    payload["token"] = Settings::getAttraccessAuthConfig().apiKey;
    this->sendMessage(true, "READER_REQUEST_AUTHENTICATION", payload);
}

void API::sendHeartbeat()
{
    // send every 5 seconds
    if (this->heartbeat_sent_at != 0 && millis() - this->heartbeat_sent_at < (1000 * 5))
    {
        return;
    }

    JsonDocument event;
    event["event"] = "HEARTBEAT";

    String json;
    serializeJson(event, json);

    this->logger.info(("pushing heartbeat to websocket queue: " + json).c_str());
    this->appState.pushOutgoingWebsocketMessageToQueue(json);

    this->heartbeat_sent_at = millis();
}

void API::onFirmwareInfo(JsonObject data)
{
    logger.info("Requested firmware info");

    JsonDocument doc;
    JsonObject response = doc.to<JsonObject>();
    response["name"] = FIRMWARE_NAME;
    response["variant"] = FIRMWARE_VARIANT;
    response["version"] = FIRMWARE_VERSION;
    this->sendMessage(true, "READER_FIRMWARE_INFO", response);
}

void API::onFirmwareUpdateRequired(JsonObject data)
{
    logger.info("Firmware update required");

    logger.error("Firmware update required not implemented");
}

void API::onFirmwareStreamChunk(JsonObject data)
{
    logger.info("Received firmware stream chunk");

    logger.error("Firmware stream chunk not implemented");
}

void API::onConfirmAction(JsonObject data)
{
    logger.info("CONFIRM_ACTION");

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
        logger.error("UNSUPPORTED CONFIRM ACTION");
    }

    logger.error("Confirm action not implemented");
}

void API::onDisplaySuccess(JsonObject data)
{
    String message = "";
    if (data["payload"].is<JsonObject>() && data["payload"]["message"].is<String>())
    {
        message = data["payload"]["message"].as<String>();
    }
    logger.error("Display success not implemented");
}

void API::onDisplayError(JsonObject data)
{
    String message = "";
    if (data["payload"].is<JsonObject>() && data["payload"]["message"].is<String>())
    {
        message = data["payload"]["message"].as<String>();
    }
    logger.error("Display error not implemented");
}

void API::onSelectItem(JsonObject data)
{
    this->is_in_select_item_mode = true;
    this->select_item_current_value = "";

    this->select_item_type = data["payload"]["itemType"].as<String>();
    // options array is array of objects with id and label
    this->select_item_options = data["payload"]["options"].as<JsonArray>();

    logger.error("Select item not implemented");
}

void API::onReaderAuthenticated(JsonObject data)
{
    logger.info("READER_AUTHENTICATED");

    String deviceName = data["payload"]["name"].as<String>();

    this->appState.setApiState(true, deviceName);

    logger.info("Reader Authentication successful.");
}