#include "api.hpp"

void API::updateSateInfo()
{
    auto websocketState = State::getWebsocketState();
    auto networkState = State::getNetworkState();
    auto apiState = State::getApiState();

    this->loopIsEnabled = websocketState.connected && (networkState.wifi_connected || networkState.ethernet_connected);

    if (!this->loopIsEnabled && apiState.authenticated)
    {
        State::setApiState(false, "");
    }
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
        this->sendAuthenticationRequest();
    }
    else if (eventType == "RESOURCE_LIST")
    {
        this->onResourceList(data);
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

    this->sendMessage("READER_REGISTER", JsonObject());
}

bool API::isRegistered()
{
    return (Settings::getAttraccessAuthConfig().apiKey.length() > 0);
}

void API::sendAck(const char *type)
{
    this->sendMessage(("ACK_" + String(type)).c_str());
}

void API::sendMessage(const char *type)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    this->sendMessage(type, payload);
}

void API::sendMessage(const char *type, JsonObject payload)
{
    JsonDocument event;
    event["event"] = "EVENT";
    event["data"]["type"] = type;

    // Create a copy of the payload in the destination document
    JsonObject eventPayload = event["data"]["payload"].to<JsonObject>();
    for (JsonPair p : payload)
    {
        eventPayload[p.key()] = p.value();
    }

    String payloadString = event["data"]["payload"].as<String>();

    logger.debug(("Sending event of type " + String(type) + " with payload " + payloadString).c_str());

    String json;
    serializeJson(event, json);

    this->logger.info(("pushing message to queue: " + json).c_str());
    this->websocket.sendMessage(json);
}

void API::sendAuthenticationRequest()
{
    if (!this->isRegistered())
    {
        logger.info("Not registered, sending registration request");
        this->sendMessage("READER_REGISTER");
        return;
    }

    logger.info("Sending authentication request");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["id"] = Settings::getAttraccessAuthConfig().readerId;
    payload["token"] = Settings::getAttraccessAuthConfig().apiKey;
    this->sendMessage("READER_AUTHENTICATE", payload);
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

void API::sendFirmwareInfo()
{
    this->logger.info("Requested firmware info");

    JsonDocument doc;
    JsonObject response = doc.to<JsonObject>();
    response["name"] = FIRMWARE_NAME;
    response["variant"] = FIRMWARE_VARIANT;
    response["version"] = FIRMWARE_VERSION;
    this->sendMessage("READER_FIRMWARE_INFO", response);
}

void API::onReaderAuthenticated(JsonObject data)
{
    logger.info("READER_AUTHENTICATED");

    String deviceName = data["payload"]["name"].as<String>();

    State::setApiState(true, deviceName);

    logger.info("Reader Authentication successful.");

    this->sendFirmwareInfo();
}

void API::onResourceList(JsonObject data)
{
    this->logger.info("Received resource list");
    if (this->resourceListUpdateCallback == nullptr)
    {
        this->logger.error("Resource list update callback is not set");
        return;
    }
    this->resourceListUpdateCallback(data["payload"]["resources"].as<JsonArray>());
}

void API::setResourceListUpdateCallback(std::function<void(JsonArray)> callback)
{
    this->resourceListUpdateCallback = callback;
}