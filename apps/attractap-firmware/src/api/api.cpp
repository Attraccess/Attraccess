#include "api.hpp"

void API::setup()
{
    xTaskCreate(taskFn, "API", 8192, this, TASK_PRIORITY_API, NULL);
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
    uint32_t lastStateChangeTime = State::getLastStateChangeTime();
    if (this->lastKnownAppStateChangeTime >= lastStateChangeTime)
    {
        return;
    }

    this->lastKnownAppStateChangeTime = lastStateChangeTime;

    auto websocketState = State::getWebsocketState();
    auto networkState = State::getNetworkState();

    this->loopIsEnabled = websocketState.connected && (networkState.wifi_connected || networkState.ethernet_connected);
}

void API::loop()
{
    this->updateSateInfo();
    // Always try to drain/process any available incoming messages
    this->processAvailableMessages();
    this->processInputEvents();

    // Only send heartbeat when connection is usable
    if (this->loopIsEnabled)
    {
        this->sendHeartbeat();
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
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_FIRMWARE_UPDATE, payload);
    }

    else if (eventType == "NFC_ENABLE_CARD_CHECKING")
    {
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_WAIT_FOR_NFC_TAP, payload);
    }
    else if (eventType == "WAIT_FOR_PROCESSING")
    {
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_WAIT_FOR_PROCESSING, payload);
    }
    else if (eventType == "NFC_CHANGE_KEY")
    {
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_WAIT_FOR_PROCESSING, payload);

        uint8_t keyNumber = data["payload"]["keyNumber"].as<uint8_t>();
        String authKeyHex = data["payload"]["authKey"].as<String>();
        String oldKeyHex = data["payload"]["oldKey"].as<String>();
        String newKeyHex = data["payload"]["newKey"].as<String>();

        State::pushNfcCommandToQueue(State::NfcCommandType::NFC_COMMAND_TYPE_CHANGE_KEY, String(keyNumber) + " " + authKeyHex + " " + oldKeyHex + " " + newKeyHex);
    }
    else if (eventType == "NFC_AUTHENTICATE")
    {
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_WAIT_FOR_PROCESSING, payload);

        String authKeyHex = data["payload"]["authenticationKey"].as<String>();
        uint8_t keyNumber = data["payload"]["keyNumber"].as<uint8_t>();

        State::pushNfcCommandToQueue(State::NfcCommandType::NFC_COMMAND_TYPE_AUTHENTICATE, String(keyNumber) + " " + authKeyHex);
    }

    else if (eventType == "DISPLAY_SUCCESS")
    {
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_DISPLAY_SUCCESS, payload);
    }
    else if (eventType == "DISPLAY_ERROR")
    {
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_DISPLAY_ERROR, payload);
    }
    else if (eventType == "DISPLAY_TEXT")
    {
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_DISPLAY_TEXT, payload);
    }

    else if (eventType == "SELECT_ITEM")
    {
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_RESOURCE_SELECTION, payload);
    }
    else if (eventType == "CONFIRM_ACTION")
    {
        State::setApiEventData(State::ApiEventState::API_EVENT_STATE_CONFIRM_ACTION, payload);
    }
    else
    {
        logger.error(("Unknown event type: " + eventType).c_str());
        logger.error(payloadString.c_str());
    }
}

void API::processInputEvents()
{
    State::ApiInputEvent event;
    if (!State::getNextApiInputEvent(event))
    {
        return;
    }

    switch (event.type)
    {
    case State::ApiInputEventType::API_INPUT_EVENT_KEYPAD_CONFIRM_PRESSED:
    {
        String value(event.payload);
        this->onKeyPadConfirmPressed(value);
        break;
    }

    case State::ApiInputEventType::API_INPUT_EVENT_KEYPAD_CANCEL_PRESSED:
        this->onKeyPadCancelPressed();
        break;

    case State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_DETECTED:
    {
        String cardUid(event.payload);
        this->onNfcCardDetected(cardUid);
        break;
    }

    case State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_CHANGE_KEY_SUCCESS:
    {
        String payload(event.payload);
        this->onNfcCardChangeKeySuccess(payload);
        break;
    }

    case State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_CHANGE_KEY_FAILED:
    {
        String payload(event.payload);
        this->onNfcCardChangeKeyFailed(payload);
        break;
    }

    case State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_AUTHENTICATE_SUCCESS:
    {
        String payload(event.payload);
        this->onNfcCardAuthenticateSuccess(payload);
        break;
    }

    case State::ApiInputEventType::API_INPUT_EVENT_NFC_CARD_AUTHENTICATE_FAILED:
    {
        String payload(event.payload);
        this->onNfcCardAuthenticateFailed(payload);
        break;
    }

    default:
        this->logger.errorf("Unknown input event type: %d", event.type);
        break;
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

    State::setApiState(false, "");
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
    State::pushOutgoingWebsocketMessageToQueue(json);
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
    State::pushOutgoingWebsocketMessageToQueue(json);

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

void API::onReaderAuthenticated(JsonObject data)
{
    logger.info("READER_AUTHENTICATED");

    String deviceName = data["payload"]["name"].as<String>();

    State::setApiState(true, deviceName);

    logger.info("Reader Authentication successful.");
}

void API::onKeyPadConfirmPressed(String value)
{
    switch (State::getApiEventData().state)
    {
    case State::ApiEventState::API_EVENT_STATE_RESOURCE_SELECTION:
    {
        JsonDocument doc;
        JsonObject payload = doc.to<JsonObject>();
        payload["value"] = value;
        this->sendMessage(true, "SELECT_ITEM", payload);
        break;
    }
    case State::ApiEventState::API_EVENT_STATE_CONFIRM_ACTION:
    {
        this->sendMessage(true, "CONFIRM_ACTION");
        break;
    }
    default:
        this->logger.error("onKeyPadConfirmPressed but not in a confirmable api state");
        break;
    }
}

void API::onKeyPadCancelPressed()
{
    this->logger.error("onKeyPadCancelPressed but not in a cancelable api state");
}

void API::onNfcCardDetected(String cardUid)
{
    this->logger.info(("NFC card detected: " + cardUid).c_str());
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["cardUID"] = cardUid;
    this->sendMessage(false, "NFC_TAP", payload);
}

void API::onNfcCardChangeKeySuccess(String payload)
{
    this->logger.info(("NFC card change key success: " + payload).c_str());
    JsonDocument doc;
    JsonObject responsePayload = doc.to<JsonObject>();
    responsePayload["successful"] = true;
    this->sendMessage(true, "NFC_CHANGE_KEY", responsePayload);
}

void API::onNfcCardChangeKeyFailed(String payload)
{
    this->logger.error(("NFC card change key failed: " + payload).c_str());

    JsonDocument doc;
    JsonObject responsePayload = doc.to<JsonObject>();
    responsePayload["successful"] = false;
    this->sendMessage(true, "NFC_CHANGE_KEY", responsePayload);
}

void API::onNfcCardAuthenticateSuccess(String payload)
{
    this->logger.info(("NFC card authenticate success: " + payload).c_str());

    JsonDocument doc;
    JsonObject responsePayload = doc.to<JsonObject>();
    responsePayload["successful"] = true;
    this->sendMessage(true, "NFC_AUTHENTICATE", responsePayload);
}

void API::onNfcCardAuthenticateFailed(String payload)
{
    this->logger.error(("NFC card authenticate failed: " + payload).c_str());

    JsonDocument doc;
    JsonObject responsePayload = doc.to<JsonObject>();
    responsePayload["successful"] = false;
    this->sendMessage(true, "NFC_AUTHENTICATE", responsePayload);
}
