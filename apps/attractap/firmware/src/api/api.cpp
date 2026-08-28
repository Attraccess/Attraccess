// API core spine: lifecycle, websocket message dispatch, and outbound messaging
// FEATURE: api-core

#include "api.hpp"
#include <functional>
#include "../utils.hpp"
#include "platform.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <cstring>
#include <memory>
#include <string>

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
    this->bleProxy.setup([this](const char *requestId,
                                const char *operation,
                                bool success,
                                const char *error,
                                const char *address,
                                int addressType,
                                int rssi,
                                const char *name,
                                const char *valueHex)
                         {
        JsonDocument doc;
        JsonObject payload = doc.to<JsonObject>();
        payload["requestId"] = requestId;
        payload["operation"] = operation;
        payload["success"] = success;
        if (error) payload["error"] = error;
        if (address) payload["address"] = address;
        if (addressType >= 0) payload["addressType"] = addressType;
        if (rssi != 0) payload["rssi"] = rssi;
        if (name && name[0] != '\0') payload["name"] = name;
        if (valueHex) payload["valueHex"] = valueHex;
        this->sendMessage("BLE_PROXY_RESULT", payload); });
    this->websocket.setup();
    this->websocket.setMessageCallbackRaw([this](const char *buf, size_t len)
                                          { this->processIncomingMessage(buf, len); });
#ifndef DEMO_MODE
    this->websocket.setBinaryDataCallback([this](esp_websocket_event_data_t data)
                                          { this->firmware.onChunk(data); });
#endif
}
void API::setFirmwareUpdateProgressCallback(std::function<void(int)> callback)
{
    this->firmwareUpdateProgressCallback = callback;
}

void API::setFirmwareUpdateMetaCallback(std::function<void(std::string availableVersion)> callback)
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
        logger.error((std::string("JSON parse error: ") + err.c_str()).c_str());
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
        logger.error((std::string("Missing event type, payload: ") + std::string(buf, len)).c_str());
        return;
    }

    // Crash-report responses carry their own error codes (e.g. INVALID_CRASH_REPORT)
    // that must not surface as a user-facing error dialog; route them to the handler.
    bool isCrashReportEvent = strcmp(eventType, "READER_CRASH_REPORT") == 0;

    // Enrollment key-request errors (e.g. CARD_ALREADY_ENROLLED) must reach the
    // enrollment handler so it can show the in-screen message and re-arm card
    // detection. The generic interceptor would otherwise pop a generic dialog
    // and return before recovery runs, wedging the reader with detection off
    // until enrollment times out (ATT-503).
    bool isEnrollKeyRequestEvent = strcmp(eventType, "ENROLL_NEW_CARD_REQUEST_NFC_KEY") == 0;

    // Two-card supervision errors (e.g. SUPERVISOR_NOT_AUTHORIZED, NO_SUPERVISORS_AVAILABLE) are
    // recoverable in-flow: the supervision screen surfaces them and either keeps waiting or aborts
    // cleanly. Route them to the dedicated handlers instead of the generic error dialog (ATT-493).
    bool isSupervisionEvent = strcmp(eventType, "SUPERVISION_REQUEST") == 0 ||
                              strcmp(eventType, "SUPERVISION_START") == 0 ||
                              strcmp(eventType, "SUPERVISOR_CARD_AUTHENTICATION_DATA") == 0 ||
                              strcmp(eventType, "SUPERVISION_RESOLVED") == 0;

    // Early error handling: if payload.error is present and non-empty, raise error callback and stop
    if (!isCrashReportEvent && !isEnrollKeyRequestEvent && !isSupervisionEvent &&
        inboundDoc["data"]["payload"].is<JsonObject>())
    {
        JsonObject payload = inboundDoc["data"]["payload"].as<JsonObject>();
        if (payload["error"].is<const char *>())
        {
            std::string err = payload["error"].as<std::string>();
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
                        this->errorCallback("Fehler", translateReaderError(err).c_str());
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
    else if (strcmp(eventType, "SUPERVISION_REQUEST") == 0)
    {
        this->onSupervisionRequestResult(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "SUPERVISION_START") == 0)
    {
        this->onSupervisionStart(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "SUPERVISOR_CARD_AUTHENTICATION_DATA") == 0)
    {
        this->onSupervisorCardAuthenticationData(inboundDoc["data"].as<JsonObject>());
    }
    else if (strcmp(eventType, "SUPERVISION_RESOLVED") == 0)
    {
        this->onSupervisionResolved(inboundDoc["data"].as<JsonObject>());
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
    else if (strcmp(eventType, "RESET_NFC_CARD") == 0)
    {
        this->onResetNfcCard(inboundDoc["data"].as<JsonObject>());
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
    else if (strcmp(eventType, "BLE_PROXY_COMMAND") == 0)
    {
        this->bleProxy.execute(inboundDoc["data"]["payload"].as<JsonObjectConst>());
    }
    else
    {
        logger.error((std::string("Unknown event type: ") + eventType).c_str());
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
    this->sendMessage(("ACK_" + std::string(type)).c_str());
}

void API::sendMessage(const char *type)
{
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    this->sendMessage(type, payload);
}

bool API::sendMessage(const char *type, JsonObject payload)
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
            return false;
        }
        this->logger.info((std::string("sending message to websocket: ") + json).c_str());
        return this->websocket.sendMessage(json, n);
    }

    std::unique_ptr<char[]> json(new (std::nothrow) char[requiredBytes]);
    if (!json)
    {
        this->logger.error("Failed to allocate buffer for outgoing event");
        return false;
    }
    size_t n = serializeJson(event, json.get(), requiredBytes);
    if (n == 0)
    {
        this->logger.error("Failed to serialize event to dynamically allocated buffer");
        return false;
    }
    this->logger.info((std::string("sending message to websocket: ") + json.get()).c_str());
    return this->websocket.sendMessage(json.get(), n);
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
    this->logger.info((std::string("pushing heartbeat to websocket queue: ") + json).c_str());
    this->websocket.sendHeartbeat(json, n);

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

void API::resetCertificateTrust()
{
    this->websocket.resetCertificateTrust();
}
