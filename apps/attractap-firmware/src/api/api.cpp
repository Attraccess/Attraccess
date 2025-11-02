#include "api.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

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
    this->websocket.setMessageCallbackRaw([this](const char *buf, size_t len)
                                          { this->processIncomingMessage(buf, len); });
    this->websocket.setBinaryDataCallback([this](esp_websocket_event_data_t data)
                                          { this->onFirmwareChunkEvent(data); });
}
void API::setFirmwareUpdateProgressCallback(std::function<void(int)> callback)
{
    this->firmwareUpdateProgressCallback = callback;
}

void API::setFirmwareUpdateMetaCallback(std::function<void(const char *currentVersion, const char *availableVersion)> callback)
{
    this->firmwareUpdateMetaCallback = callback;
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

void API::processIncomingMessage(const char *buf, size_t len)
{
    // Parse into persistent inboundDoc to avoid deep stack usage in websocket task (no filter; server sends only needed fields)
    inboundDoc.clear();
    auto err = deserializeJson(inboundDoc, buf, len);
    if (err)
    {
        logger.error((String("JSON parse error: ") + err.c_str()).c_str());
        return;
    }

    const char *eventType = inboundDoc["data"]["type"].as<const char *>();
    if (!eventType)
    {
        logger.error("Missing event type");
        return;
    }

    // Early error handling: if payload.error is present and non-empty, raise error callback and stop
    if (inboundDoc["data"]["payload"].is<JsonObject>())
    {
        JsonObject payload = inboundDoc["data"]["payload"].as<JsonObject>();
        if (payload["error"].is<String>())
        {
            String err = payload["error"].as<String>();
            if (err.length() > 0)
            {
                // Special-case insufficient balance: propagate sumUpEnabled flag if present
                if (err == "INSUFFICIENT_BALANCE")
                {
                    bool sumUpEnabled = payload["sumUpEnabled"].is<bool>() ? payload["sumUpEnabled"].as<bool>() : false;
                    if (this->insufficientBalanceCallback)
                    {
                        this->insufficientBalanceCallback(sumUpEnabled);
                    }
                }
                else
                {
                    if (this->errorCallback)
                    {
                        this->errorCallback("Fehler", err.c_str());
                    }
                }
                // Do not process further
                this->sendAck(eventType);
                return;
            }
        }
    }

    this->sendAck(eventType);

    if (strcmp(eventType, "READER_REGISTER") == 0)
    {
        this->onRegistrationData(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "READER_UNAUTHORIZED") == 0)
    {
        this->onUnauthorized(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "READER_AUTHENTICATED") == 0)
    {
        this->onReaderAuthenticated(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "READER_REQUEST_AUTHENTICATION") == 0)
    {
        this->sendAuthenticationRequest();
    }
    else if (strcmp(eventType, "RESOURCE_LIST") == 0)
    {
        this->onResourceList(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "CARD_AUTHENTICATION_DATA") == 0)
    {
        this->onCardAuthenticationDetailsResponse(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO") == 0)
    {
        this->onEnrollNewCardGetAvailableKeyNo(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "ENROLL_NEW_CARD") == 0)
    {
        this->onEnrollNewCard(inboundDoc["data"].as<JsonObject>());
    }
    else if (
        strcmp(eventType, "START_RESOURCE_USAGE_SESSION") == 0 ||
        strcmp(eventType, "STOP_RESOURCE_USAGE_SESSION") == 0 ||
        strcmp(eventType, "LOCK_DOOR") == 0 ||
        strcmp(eventType, "UNLOCK_DOOR") == 0 ||
        strcmp(eventType, "UNLATCH_DOOR") == 0 ||
        strcmp(eventType, "TRIGGER_FLOW_BUTTON") == 0)
    {
        // Generic action result handling
        bool success = false;
        if (inboundDoc["data"]["payload"].is<JsonObject>())
        {
            JsonObject payload = inboundDoc["data"]["payload"].as<JsonObject>();
            if (payload["success"].is<bool>())
            {
                success = payload["success"].as<bool>();
            }
        }
        if (this->actionResultCallback)
        {
            this->actionResultCallback(eventType, success);
        }
    }
    else if (strcmp(eventType, "READER_FIRMWARE_UPDATE_REQUIRED") == 0)
    {
        // Initialize OTA from metadata and request first chunk
        JsonObject fw = inboundDoc["data"]["payload"]["firmware"].as<JsonObject>();
        if (fw.isNull())
        {
            logger.error("Firmware update required event missing firmware payload");
            return;
        }
        this->startFirmwareUpdate(fw);
    }
    else
    {
        logger.error((String("Unknown event type: ") + eventType).c_str());
    }
}

// --- OTA state & helpers ---

void API::startFirmwareUpdate(JsonObject firmwareMeta)
{
    if (this->ota.inProgress)
    {
        this->logger.error("Firmware update already in progress");
        return;
    }

    this->logger.info("Starting OTA firmware update");

    this->ota.totalSize = firmwareMeta["totalSize"].is<uint32_t>() ? firmwareMeta["totalSize"].as<uint32_t>() : 0;
    this->ota.bytesWritten = 0;
    this->ota.inProgress = false;

    if (this->ota.totalSize == 0)
    {
        this->logger.error("Invalid firmware meta (totalSize)");
        return;
    }

    this->ota.updatePartition = esp_ota_get_next_update_partition(NULL);
    if (!this->ota.updatePartition)
    {
        this->logger.error("OTA: no update partition found");
        return;
    }
    esp_err_t err = esp_ota_begin(this->ota.updatePartition, OTA_SIZE_UNKNOWN, &this->ota.otaHandle);
    if (err != ESP_OK)
    {
        this->logger.error((String("esp_ota_begin failed: ") + esp_err_to_name(err)).c_str());
        return;
    }
    this->ota.inProgress = true;
    this->ota.lastReportedPercent = -1;

    // Inform UI: preparing and version meta if available
    if (inboundDoc["data"]["payload"]["available"]["version"].is<const char *>() && inboundDoc["data"]["payload"]["firmware"]["version"].is<const char *>())
    {
        const char *available = inboundDoc["data"]["payload"]["available"]["version"].as<const char *>();
        const char *current = inboundDoc["data"]["payload"]["firmware"]["version"].as<const char *>();
        if (this->firmwareUpdateMetaCallback)
        {
            this->firmwareUpdateMetaCallback(current, available);
        }
    }
    this->updateFirmwareProgress(0);

    // Request first chunk via websocket; keep the WS connection active during OTA
    this->requestNextFirmwareChunk();
}

void API::requestNextFirmwareChunk()
{
    const uint32_t remaining = (this->ota.totalSize > this->ota.bytesWritten) ? (this->ota.totalSize - this->ota.bytesWritten) : 0;
    if (remaining == 0)
    {
        return;
    }
    const uint32_t CHUNK = 4096; // must match server maxChunk to avoid split across WS frames
    uint32_t len = remaining < CHUNK ? remaining : CHUNK;
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["offset"] = this->ota.bytesWritten;
    payload["length"] = len;
    this->sendMessage("FIRMWARE_REQUEST_CHUNK", payload);
}

void API::onFirmwareChunkEvent(esp_websocket_event_data_t data)
{
    if (!this->ota.inProgress)
    {
        return; // ignore unexpected binary frames
    }

    // The ESP websocket client may deliver a single server send across multiple callbacks
    // Use payload_len (total message size) and payload_offset (offset within message) to write contiguously
    const uint8_t *fragmentPtr = (const uint8_t *)data.data_ptr;
    const size_t fragmentLen = (size_t)data.data_len;
    const size_t messageTotal = (size_t)data.payload_len;     // entire WS message length
    const size_t messageOffset = (size_t)data.payload_offset; // offset within current WS message

    // First fragment of this binary message: validate image header if it's the first file bytes
    if (this->ota.bytesWritten == 0 && messageOffset == 0 && fragmentLen >= sizeof(esp_image_header_t))
    {
        const esp_image_header_t *hdr = (const esp_image_header_t *)fragmentPtr;
        if (hdr->magic != ESP_IMAGE_HEADER_MAGIC)
        {
            this->abortFirmwareUpdate("Invalid firmware image header magic");
            return;
        }
    }

    // Write this fragment to OTA
    if (fragmentLen > 0)
    {
        esp_err_t werr = esp_ota_write(this->ota.otaHandle, fragmentPtr, fragmentLen);
        if (werr != ESP_OK)
        {
            this->abortFirmwareUpdate((String("esp_ota_write failed: ") + esp_err_to_name(werr)).c_str());
            return;
        }
        this->ota.bytesWritten += (uint32_t)fragmentLen;
        this->currentChunkReceivedBytes += (uint32_t)fragmentLen;
    }

    if (this->ota.totalSize > 0)
    {
        int pct = (int)(((float)this->ota.bytesWritten / (float)this->ota.totalSize) * 100.0f);
        if (pct < 0)
            pct = 0;
        if (pct > 100)
            pct = 100;
        if (pct == 100 || this->ota.lastReportedPercent < 0 || pct - this->ota.lastReportedPercent >= 5)
        {
            this->ota.lastReportedPercent = pct;
            this->updateFirmwareProgress(pct);
        }
    }

    // When a full WS message (one requested chunk) is finished, request next chunk
    if (messageOffset + fragmentLen < messageTotal)
    {
        // still more fragments for this WS message; wait for next callback
        return;
    }
    // Full message completed
    this->currentChunkReceivedBytes = 0;
    this->currentChunkExpectedBytes = 0;

    if (this->ota.bytesWritten < this->ota.totalSize)
    {
        this->requestNextFirmwareChunk();
        return;
    }

    esp_err_t endErr = esp_ota_end(this->ota.otaHandle);
    if (endErr != ESP_OK)
    {
        this->abortFirmwareUpdate((String("esp_ota_end failed: ") + esp_err_to_name(endErr)).c_str());
        return;
    }
    esp_err_t setBootErr = esp_ota_set_boot_partition(this->ota.updatePartition);
    if (setBootErr != ESP_OK)
    {
        this->abortFirmwareUpdate((String("esp_ota_set_boot_partition failed: ") + esp_err_to_name(setBootErr)).c_str());
        return;
    }

    this->updateFirmwareProgress(100);
    this->logger.info("Firmware update complete, restarting...");
    delay(250);
    esp_restart();
}

void API::abortFirmwareUpdate(const char *reason)
{
    this->logger.error((String("OTA aborted: ") + reason).c_str());
    if (this->ota.otaHandle)
    {
        esp_ota_abort(this->ota.otaHandle);
    }
    this->ota.inProgress = false;
    this->ota.bytesWritten = 0;
    this->updateFirmwareProgress(0);
}

void API::updateFirmwareProgress(int percent)
{
    if (this->firmwareUpdateProgressCallback)
        this->firmwareUpdateProgressCallback(percent);
}

void API::setErrorCallback(std::function<void(const char *title, const char *message)> callback)
{
    this->errorCallback = callback;
}

void API::setActionResultCallback(std::function<void(const char *type, bool success)> callback)
{
    this->actionResultCallback = callback;
}

void API::setInsufficientBalanceCallback(std::function<void(bool sumUpEnabled)> callback)
{
    this->insufficientBalanceCallback = callback;
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

    char json[JSON_OUTBUF_SMALL];
    size_t n = serializeJson(event, json, sizeof(json));
    if (n == 0)
    {
        this->logger.error("Failed to serialize event to buffer (small)");
        return;
    }
    this->logger.info((String("pushing message to queue: ") + String(json)).c_str());
    this->websocket.sendMessage(json, n);
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
    JsonDocument event;
    event["event"] = "EVENT";
    event["data"]["type"] = "READER_AUTHENTICATE";
    event["data"]["payload"]["id"] = Settings::getAttraccessAuthConfig().readerId;
    event["data"]["payload"]["token"] = Settings::getAttraccessAuthConfig().apiKey;
    char json[JSON_OUTBUF_AUTH];
    size_t n = serializeJson(event, json, sizeof(json));
    if (n == 0)
    {
        this->logger.error("Failed to serialize authenticate event to buffer");
        return;
    }
    this->logger.info((String("pushing message to queue: ") + String(json)).c_str());
    this->websocket.sendMessage(json, n);
}

void API::sendHeartbeat()
{
    // send every 5 seconds
    if (this->ota.inProgress)
    {
        // Suppress heartbeats during OTA to avoid websocket contention
        return;
    }
    if (this->heartbeat_sent_at != 0 && millis() - this->heartbeat_sent_at < (1000 * 5))
    {
        return;
    }

    JsonDocument event;
    event["event"] = "HEARTBEAT";

    char json[JSON_OUTBUF_SMALL];
    size_t n = serializeJson(event, json, sizeof(json));
    if (n == 0)
    {
        this->logger.error("Failed to serialize heartbeat");
        return;
    }
    this->logger.info((String("pushing heartbeat to websocket queue: ") + String(json)).c_str());
    this->websocket.sendMessage(json, n);

    this->heartbeat_sent_at = millis();
}

void API::sendFirmwareInfo()
{
    this->logger.info("Requested firmware info");

    JsonDocument event;
    event["event"] = "EVENT";
    event["data"]["type"] = "READER_FIRMWARE_INFO";
    event["data"]["payload"]["name"] = FIRMWARE_NAME;
    event["data"]["payload"]["variant"] = FIRMWARE_VARIANT;
    event["data"]["payload"]["version"] = FIRMWARE_VERSION;
    char json[JSON_OUTBUF_SMALL];
    size_t n = serializeJson(event, json, sizeof(json));
    if (n == 0)
    {
        this->logger.error("Failed to serialize firmware info");
        return;
    }
    this->websocket.sendMessage(json, n);
}

void API::onReaderAuthenticated(JsonObject data)
{
    logger.info("READER_AUTHENTICATED");

    String deviceName = data["payload"]["name"].as<String>();

    State::setApiState(true, deviceName);

    if (this->deviceNameCallback != nullptr)
    {
        this->deviceNameCallback(deviceName);
    }

    logger.info("Reader Authentication successful.");

    this->sendFirmwareInfo();
}

void API::onResourceList(JsonObject data)
{
    uint32_t messageCounter = data["payload"]["messageId"].is<uint32_t>() ? data["payload"]["messageId"].as<uint32_t>() : 0;
    if (messageCounter <= this->resourceListMessageCounter && this->resourceListMessageCounter != 0)
    {
        this->logger.info("Received resource list with older message ID; ignoring");
        return;
    }
    this->resourceListMessageCounter = messageCounter;

    if (data["payload"]["readerName"].is<String>())
    {
        this->logger.info("Received updated reader name");
        String readerName = data["payload"]["readerName"].as<String>();

        if (this->deviceNameCallback != nullptr)
        {
            this->deviceNameCallback(readerName);
        }
    }

    this->logger.info("Received resource list");
    if (this->resourceListUpdateCallback == nullptr)
    {
        this->logger.error("Resource list update callback is not set");
        return;
    }

    ResourceList &result = this->resourceListScratch;
    memset(&result, 0, sizeof(ResourceList));
    JsonArray arr = data["payload"]["resources"].as<JsonArray>();
    if (arr.isNull())
    {
        this->resourceListUpdateCallback(result);
        return;
    }

    uint16_t count = 0;
    for (JsonObject resource : arr)
    {
        if (count >= MAX_RESOURCES)
        {
            break;
        }

        ResourceBrief &dst = result.items[count];
        dst.id = resource["id"].is<uint32_t>() ? resource["id"].as<uint32_t>() : 0;
        const char *typeStr = resource["type"].as<const char *>();
        dst.type = (typeStr && strcmp(typeStr, "door") == 0) ? 1 : 0;
        dst.separateUnlockAndUnlatch = resource["separateUnlockAndUnlatch"].is<bool>() ? resource["separateUnlockAndUnlatch"].as<bool>() : false;
        dst.allowTakeOver = resource["allowTakeOver"].is<bool>() ? resource["allowTakeOver"].as<bool>() : false;

        const char *name = resource["name"].as<const char *>();
        const char *desc = resource["description"].as<const char *>();
        if (name)
        {
            strlcpy(dst.name, name, sizeof(dst.name));
        }
        else
        {
            dst.name[0] = '\0';
        }
        if (desc)
        {
            strlcpy(dst.description, desc, sizeof(dst.description));
        }
        else
        {
            dst.description[0] = '\0';
        }

        JsonObject aus = resource["activeUsageSession"].as<JsonObject>();
        if (!aus.isNull() && aus["user"]["username"].is<const char *>() && aus["startTime"].is<const char *>())
        {
            dst.hasActiveUsage = true;
            const char *username = aus["user"]["username"].as<const char *>();
            strlcpy(dst.activeUser, username ? username : "", sizeof(dst.activeUser));
            const char *startIso = aus["startTime"].as<const char *>();
            dst.activeStartEpoch = parseIso8601ToTimeT(startIso);
        }
        else
        {
            dst.hasActiveUsage = false;
            dst.activeUser[0] = '\0';
            dst.activeStartEpoch = 0;
        }

        // Parse introducers: array of strings (usernames)
        dst.introducerCount = 0;
        JsonArray introducers = resource["introducers"].as<JsonArray>();
        if (!introducers.isNull())
        {
            uint8_t idx = 0;
            for (JsonVariant v : introducers)
            {
                if (idx >= MAX_INTRODUCERS)
                {
                    break;
                }
                const char *introName = v.is<const char *>() ? v.as<const char *>() : nullptr;
                if (introName && introName[0] != '\0')
                {
                    strlcpy(dst.introducers[idx], introName, sizeof(dst.introducers[idx]));
                    idx++;
                }
            }
            dst.introducerCount = idx;
        }

        // Parse flowButtons: array of { id, label }
        dst.flowButtonCount = 0;
        JsonArray flowButtons = resource["flowButtons"].as<JsonArray>();
        if (!flowButtons.isNull())
        {
            uint8_t fbIdx = 0;
            for (JsonObject btn : flowButtons)
            {
                if (fbIdx >= MAX_FLOW_BUTTONS)
                {
                    break;
                }
                API::FlowButton &fb = dst.flowButtons[fbIdx];
                const char *idStr = btn["id"].as<const char *>();
                if (!idStr)
                {
                    idStr = "";
                }
                strlcpy(fb.id, idStr, sizeof(fb.id));
                const char *lbl = btn["label"].as<const char *>();
                if (!lbl)
                {
                    lbl = "";
                }
                strlcpy(fb.label, lbl, sizeof(fb.label));
                fbIdx++;
            }
            dst.flowButtonCount = fbIdx;
        }

        count++;
    }

    result.count = count;
    this->resourceListUpdateCallback(result);
}

void API::triggerFlowButton(uint32_t resourceId, const char *buttonId)
{
    this->logger.info("Triggering flow button");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    payload["buttonId"] = buttonId ? buttonId : "";
    this->sendMessage("TRIGGER_FLOW_BUTTON", payload);
}

void API::requestBillingTopup(uint32_t amountCents)
{
    this->logger.info("Requesting billing top-up");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["amountCents"] = amountCents;
    this->sendMessage("BILLING_REQUEST_TOPUP", payload);
}

void API::setResourceListUpdateCallback(std::function<void(const ResourceList &)> callback)
{
    this->resourceListUpdateCallback = callback;
}

void API::requestCardAuthenticationData(uint8_t *uid, uint8_t uidLength, uint32_t resourceId)
{
    this->logger.info("Requesting card authentication data");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["uid"] = hexToString(uid, uidLength);
    payload["resourceId"] = resourceId;
    this->sendMessage("REQUEST_CARD_AUTHENTICATION_DATA", payload);
}

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
    String username = payload["username"].is<String>() ? payload["username"].as<String>() : String("");
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

    CardAuthenticationDetailsResponse response;
    response.keyNo = keyNo;
    response.keyBytes = keyBytes;
    response.keyLen = keyLen;
    response.error = error;
    response.username = username;
    response.canManageResource = payload["canManageResource"].is<bool>() ? payload["canManageResource"].as<bool>() : false;
    response.hasIntroduction = payload["hasIntroduction"].is<bool>() ? payload["hasIntroduction"].as<bool>() : false;
    response.isIntroducer = payload["isIntroducer"].is<bool>() ? payload["isIntroducer"].as<bool>() : false;
    this->cardAuthenticationDetailsResponseCallback(response);
}

void API::setCardAuthenticationDetailsResponseCallback(std::function<void(CardAuthenticationDetailsResponse)> callback)
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

void API::setEnrollNewCardGetAvailableKeyNoCallback(std::function<void(String username)> callback)
{
    this->enrollNewCardGetAvailableKeyNoCallback = callback;
}

void API::setEnrollNewCardCallback(std::function<void(uint8_t keyNo, String key)> callback)
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

    this->enrollNewCardGetAvailableKeyNoCallback(username);
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

    this->enrollNewCardCallback(keyNo, key);
}

void API::onDeviceName(std::function<void(String)> callback)
{
    this->deviceNameCallback = callback;
}

void API::disableConnectionAttempts()
{
    this->websocket.disableConnectionAttempts();
    this->loopIsEnabled = false;
}

void API::enableConnectionAttempts()
{
    this->websocket.enableConnectionAttempts();
}