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

    /*
this->websocket.setBinaryDataCallback([this](esp_websocket_event_data_t data)
       {
// Handle fragmented frames: accumulate until expected size is reached
if (!this->pendingThumbnailWaiting)
{
return;
}

const uint8_t *chunk = (const uint8_t *)data.data_ptr;
size_t chunkLen = (size_t)data.data_len;

if (this->pendingThumbnailBuffer == nullptr)
{
this->pendingThumbnailBuffer = (uint8_t *)malloc(this->pendingThumbnailExpectedBytes);
this->pendingThumbnailReceivedBytes = 0;
if (!this->pendingThumbnailBuffer)
{
this->logger.error("Failed to allocate thumbnail buffer");
this->pendingThumbnailWaiting = false;
return;
}
}

size_t remaining = this->pendingThumbnailExpectedBytes - this->pendingThumbnailReceivedBytes;
size_t toCopy = chunkLen > remaining ? remaining : chunkLen;
memcpy(this->pendingThumbnailBuffer + this->pendingThumbnailReceivedBytes, chunk, toCopy);
this->pendingThumbnailReceivedBytes += toCopy;

if (this->pendingThumbnailReceivedBytes >= this->pendingThumbnailExpectedBytes)
{
this->logger.infof("Thumbnail received: resourceId=%u, size=%ux%u (%u bytes)", this->pendingThumbnailResourceId, this->pendingThumbnailW, this->pendingThumbnailH, (unsigned int)this->pendingThumbnailExpectedBytes);
if (this->resourceThumbnailCallback)
{
this->resourceThumbnailCallback(this->pendingThumbnailResourceId, this->pendingThumbnailW, this->pendingThumbnailH, this->pendingThumbnailBuffer, this->pendingThumbnailExpectedBytes);
}

free(this->pendingThumbnailBuffer);
this->pendingThumbnailBuffer = nullptr;
this->pendingThumbnailResourceId = 0;
this->pendingThumbnailW = 0;
this->pendingThumbnailH = 0;
this->pendingThumbnailExpectedBytes = 0;
this->pendingThumbnailReceivedBytes = 0;
this->pendingThumbnailWaiting = false;
} });
*/
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
    /*else if (eventType == "RESOURCE_THUMBNAIL_DATA")
    {
        this->onResourceThumbnailDescriptor(data);
    }*/
    else if (eventType == "CARD_AUTHENTICATION_DATA")
    {
        this->onCardAuthenticationDetailsResponse(data);
    }
    else if (eventType == "ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO")
    {
        this->onEnrollNewCardGetAvailableKeyNo(data);
    }
    else if (eventType == "ENROLL_NEW_CARD")
    {
        this->onEnrollNewCard(data);
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

            this->sendAuthenticationRequest();
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

    /*
    // Request thumbnails sequentially to avoid overlapping buffers
    JsonArray resources = data["payload"]["resources"].as<JsonArray>();
    for (JsonObject res : resources)
    {
        if (res["imageFilename"].is<String>() && res["imageFilename"].as<String>().length() > 0)
        {
            uint32_t rid = res["id"].as<uint32_t>();
            this->requestResourceThumbnail(rid, 48, 48);
            // wait until previous transfer completes
            unsigned long start = millis();
            while (this->pendingThumbnailWaiting && (millis() - start) < 3000)
            {
                // allow websocket loop to run
                this->websocket.loop();
                delay(5);
            }
        }
    }*/
}

void API::setResourceListUpdateCallback(std::function<void(JsonArray)> callback)
{
    this->resourceListUpdateCallback = callback;
}

/*
void API::setResourceThumbnailCallback(std::function<void(uint32_t, uint16_t, uint16_t, const uint8_t *, size_t)> callback)
{
    this->resourceThumbnailCallback = callback;
}
    */

void API::requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength)
{
    this->logger.info("Requesting card authentication data");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["uid"] = hexToString(uid, uidLength);
    this->sendMessage("REQUEST_CARD_AUTHENTICATION_DATA", payload);
}

/*
void API::requestResourceThumbnail(uint32_t resourceId, uint16_t width, uint16_t height)
{
    this->logger.infof("Requesting resource thumbnail for %u (%ux%u)", resourceId, width, height);
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    payload["width"] = width;
    payload["height"] = height;
    payload["format"] = "RGB565LE";
    this->sendMessage("REQUEST_RESOURCE_THUMBNAIL", payload);
}

void API::onResourceThumbnailDescriptor(JsonObject data)
{
    // Record expected size; upcoming binary frames will be accumulated until complete
    JsonObject payload = data["payload"].as<JsonObject>();
    uint32_t rid = payload["resourceId"].as<uint32_t>();
    uint16_t w = payload["width"].as<uint16_t>();
    uint16_t h = payload["height"].as<uint16_t>();
    size_t contentLength = payload["contentLength"].as<size_t>();
    this->pendingThumbnailResourceId = rid;
    this->pendingThumbnailW = w;
    this->pendingThumbnailH = h;
    this->pendingThumbnailExpectedBytes = contentLength;
    this->pendingThumbnailReceivedBytes = 0;
    if (this->pendingThumbnailBuffer)
    {
        free(this->pendingThumbnailBuffer);
        this->pendingThumbnailBuffer = nullptr;
    }
    this->pendingThumbnailWaiting = true;

    // ACK descriptor so server continues its flow
    this->sendAck("RESOURCE_THUMBNAIL_DATA");
}
*/
void API::onCardAuthenticationDetailsResponse(JsonObject data)
{
    this->logger.info("Received card authentication details response");
    if (this->cardAuthenticationDetailsResponseCallback == nullptr)
    {
        this->logger.error("Card authentication details response callback is not set");
        return;
    }
    // Extract fields safely and emit typed values
    JsonObject payload = data["payload"].as<JsonObject>();
    String error = payload["error"].is<String>() ? payload["error"].as<String>() : String("");
    uint8_t keyNo = payload["keyNo"].is<uint8_t>() ? payload["keyNo"].as<uint8_t>() : 0;
    String keyHex = payload["key"].is<String>() ? payload["key"].as<String>() : String("");

    uint8_t keyBytes[16];
    uint8_t keyLen = 0;
    if (keyHex.length() == 32)
    {
        if (stringToHexArray(keyHex, keyBytes, 16))
        {
            keyLen = 16;
        }
        else
        {
            error = "Invalid hex key";
        }
    }
    else if (keyHex.length() > 0)
    {
        error = "Invalid key length";
    }

    this->cardAuthenticationDetailsResponseCallback(keyNo, keyLen == 16 ? keyBytes : nullptr, keyLen, error);
}

void API::setCardAuthenticationDetailsResponseCallback(std::function<void(uint8_t, const uint8_t *, uint8_t, String)> callback)
{
    this->cardAuthenticationDetailsResponseCallback = callback;
}

void API::startResourceUsageSession(uint32_t resourceId)
{
    this->logger.info("Starting resource usage session");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("START_RESOURCE_USAGE_SESSION", payload);
}

void API::stopResourceUsageSession(uint32_t resourceId)
{
    this->logger.info("Stopping resource usage session");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("STOP_RESOURCE_USAGE_SESSION", payload);
}

void API::lockDoor(uint32_t resourceId)
{
    this->logger.info("Locking door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("LOCK_DOOR", payload);
}

void API::unlockDoor(uint32_t resourceId)
{
    this->logger.info("Unlocking door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("UNLOCK_DOOR", payload);
}

void API::unlatchDoor(uint32_t resourceId)
{
    this->logger.info("Unlatching door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("UNLATCH_DOOR", payload);
}

void API::setEnrollNewCardGetAvailableKeyNoCallback(std::function<bool(String username, uint8_t *uid, uint8_t *uidLength, uint8_t *keyNo)> callback)
{
    this->enrollNewCardGetAvailableKeyNoCallback = callback;
}

void API::setEnrollNewCardCallback(std::function<bool(uint8_t, String)> callback)
{
    this->enrollNewCardCallback = callback;
}

void API::sendEnrollNewCardAvailableKeyNo(uint8_t *uid, uint8_t uidLength, uint8_t keyNo)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["keyNo"] = keyNo;
    payload["uid"] = hexToString(uid, uidLength);
    // Respond with the client-to-server request event so the server can generate the key
    this->sendMessage("ENROLL_NEW_CARD_REQUEST_NFC_KEY", payload);
}

void API::sendEnrollNewCard(bool success)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["success"] = success;
    this->sendMessage("ENROLL_NEW_CARD", payload);
}

void API::onEnrollNewCardGetAvailableKeyNo(JsonObject data)
{
    this->logger.info("Received enroll new card available key no");
    if (this->enrollNewCardGetAvailableKeyNoCallback == nullptr)
    {
        this->logger.error("Enroll new card available key no callback is not set");
        return;
    }

    String username = data["payload"]["username"].as<String>();

    uint8_t cardDetectedUid[7] = {0};
    uint8_t cardDetectedUidLength = 0;
    uint8_t keyNo = 0;
    bool success = this->enrollNewCardGetAvailableKeyNoCallback(username, cardDetectedUid, &cardDetectedUidLength, &keyNo);

    if (!success)
    {
        return;
    }

    this->sendEnrollNewCardAvailableKeyNo(cardDetectedUid, cardDetectedUidLength, keyNo);
}

void API::onEnrollNewCard(JsonObject data)
{
    this->logger.info("Received enroll new card");
    if (this->enrollNewCardCallback == nullptr)
    {
        this->logger.error("Enroll new card callback is not set");
        return;
    }

    JsonObject payload = data["payload"].as<JsonObject>();
    if (payload["error"].is<String>() && payload["error"].as<String>().length() > 0)
    {
        // TODO: handle enrollment errors (surface to UI, retry flow, etc.)
        this->logger.error(("Enroll new card error from server: " + payload["error"].as<String>()).c_str());
        return;
    }

    // Only proceed when command payload contains the key material
    if (!(payload["key"].is<String>() && payload["key"].as<String>().length() == 32 && payload["keyNo"].is<uint8_t>()))
    {
        // TODO: handle server-side completion notifications (payload.success) if needed
        this->logger.info("Enroll new card payload does not contain key material; ignoring.");
        return;
    }

    uint8_t keyNo = payload["keyNo"].as<uint8_t>();
    String key = payload["key"].as<String>();

    bool success = this->enrollNewCardCallback(keyNo, key);

    this->sendEnrollNewCard(success);
}