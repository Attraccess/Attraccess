// API core spine: lifecycle, websocket message dispatch, and outbound messaging
// FEATURE: api-core

#include "api.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <memory>

constexpr size_t API::MAX_PROJECTS_PER_PAGE;

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
                                          { this->firmware.onChunk(data); });
}
void API::setFirmwareUpdateProgressCallback(std::function<void(int)> callback)
{
    this->firmwareUpdateProgressCallback = callback;
}

void API::setFirmwareUpdateMetaCallback(std::function<void(String availableVersion)> callback)
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

    this->firmware.tick();
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

    const char *topLevelEvent = inboundDoc["event"].as<const char *>();
    if (topLevelEvent && strcmp(topLevelEvent, "HEARTBEAT") == 0)
    {
        return;
    }

    const char *eventType = inboundDoc["data"]["type"].as<const char *>();
    if (!eventType)
    {
        logger.error((String("Missing event type, payload: ") + String(buf, len)).c_str());
        return;
    }

    // Crash-report responses carry their own error codes (e.g. INVALID_CRASH_REPORT)
    // that must not surface as a user-facing error dialog; route them to the handler.
    bool isCrashReportEvent = strcmp(eventType, "READER_CRASH_REPORT") == 0;

    // Early error handling: if payload.error is present and non-empty, raise error callback and stop
    if (!isCrashReportEvent && inboundDoc["data"]["payload"].is<JsonObject>())
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
    else if (strcmp(eventType, "ENROLL_NEW_CARD_REQUEST_NFC_KEY") == 0)
    {
        // The server only sends us this event to report an error; the happy
        // path responds with ENROLL_NEW_CARD instead.
        this->onEnrollNewCardRequestNFCKeyError(inboundDoc["data"].as<JsonObject>());
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
        JsonObject fw = inboundDoc["data"]["payload"]["available"].as<JsonObject>();
        if (fw.isNull())
        {
            logger.error("Firmware update required event missing available firmware payload");
            return;
        }
        this->firmware.begin(fw);
    }
    else if (strcmp(eventType, "PROJECTS_OF_USER") == 0)
    {
        this->onProjectsOfUserResponse(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "READER_CRASH_REPORT") == 0)
    {
        this->onCrashReportResponse(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "RESOURCE_USAGE_FORM_REQUEST") == 0)
    {
        this->onResourceUsageFormRequest(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "RESOURCE_USAGE_FORM_FIELDS") == 0)
    {
        this->onResourceUsageFormFields(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "RESOURCE_USAGE_FORM_PAGE_RESULT") == 0)
    {
        this->onResourceUsageFormPageResult(inboundDoc["data"].as<JsonObject>());
    }
    else
    {
        logger.error((String("Unknown event type: ") + eventType).c_str());
    }
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

    const size_t requiredBytes = measureJson(event) + 1; // include terminator
    if (requiredBytes <= JSON_OUTBUF_SMALL)
    {
        char json[JSON_OUTBUF_SMALL];
        size_t n = serializeJson(event, json, sizeof(json));
        if (n == 0)
        {
            this->logger.error("Failed to serialize event to buffer (small)");
            return;
        }
        this->logger.info((String("sending message to websocket: ") + String(json)).c_str());
        this->websocket.sendMessage(json, n);
        return;
    }

    std::unique_ptr<char[]> json(new (std::nothrow) char[requiredBytes]);
    if (!json)
    {
        this->logger.error("Failed to allocate buffer for outgoing event");
        return;
    }
    size_t n = serializeJson(event, json.get(), requiredBytes);
    if (n == 0)
    {
        this->logger.error("Failed to serialize event to dynamically allocated buffer");
        return;
    }
    this->logger.info((String("sending message to websocket: ") + String(json.get())).c_str());
    this->websocket.sendMessage(json.get(), n);
}

void API::sendHeartbeat()
{
    // send every 5 seconds
    if (this->firmware.inProgress())
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

void API::disableConnectionAttempts()
{
    this->websocket.disableConnectionAttempts();
    this->loopIsEnabled = false;
}

void API::enableConnectionAttempts()
{
    this->websocket.enableConnectionAttempts();
}
