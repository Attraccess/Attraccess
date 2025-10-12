#include "api.hpp"

void API::updateSateInfo()
{
    auto websocketState = State::getWebsocketState();
    auto networkState = State::getNetworkState();

    this->loopIsEnabled = websocketState.connected && (networkState.wifi_connected || networkState.ethernet_connected);
}

void API::setup()
{
    this->websocket.setup();
    this->websocket.setMessageCallback([this](String message)
                                       { this->processIncomingMessages(message); });
}

void API::loop()
{
    this->websocket.loop();
    this->updateSateInfo();

    // Only send heartbeat when connection is usable
    if (this->loopIsEnabled)
    {
        this->sendHeartbeat();
    }
}

void API::processIncomingMessages(String message)
{
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
        this->onRequestAuthentication();
    }

    else if (eventType == "READER_FIRMWARE_INFO")
    {
        this->onFirmwareInfo(data);
    }
    else if (eventType == "READER_FIRMWARE_UPDATE_REQUIRED")
    {
        // TODO: handle firmware update
        // State::setApiEventData(State::ApiEventState::API_EVENT_STATE_FIRMWARE_UPDATE, payload);
    }
    else
    {
        logger.error(("Unknown event type: " + eventType).c_str());
        logger.error(payloadString.c_str());
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

    this->sendMessage(false, "READER_REGISTER", JsonObject());
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
    this->websocket.sendMessage(json);
}

void API::onRequestAuthentication()
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
    this->websocket.sendMessage(json);

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
