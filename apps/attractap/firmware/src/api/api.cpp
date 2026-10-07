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
    this->transport.setup();
    this->transport.setMessageCallbackRaw([this](const char *buf, size_t len)
                                          { this->processIncomingMessage(buf, len); });
#ifdef ESP_PLATFORM
    this->transport.setBinaryDataCallback([this](esp_websocket_event_data_t data)
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
    this->transport.loop();
    this->updateSateInfo();

    // Only send heartbeat when connection is usable
    if (this->loopIsEnabled)
    {
        this->sendHeartbeat();
    }

    this->firmware.tick();
}


void API::setErrorCallback(std::function<void(const char *title, const char *message)> callback)
{
    this->errorCallback = callback;
}

void API::setActionResultCallback(std::function<void(const ActionResult &)> callback)
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
        this->logger.info((std::string("Sending reader event: ") + type).c_str());
        return this->transport.sendMessage(json, n);
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
    this->logger.info((std::string("Sending reader event: ") + type).c_str());
    return this->transport.sendMessage(json.get(), n);
}


void API::disableConnectionAttempts()
{
    this->transport.disableConnectionAttempts();
    this->loopIsEnabled = false;
}

void API::enableConnectionAttempts()
{
    this->transport.enableConnectionAttempts();
}

void API::resetCertificateTrust()
{
    this->transport.resetCertificateTrust();
}

API::API(IReaderTransport &transport) : logger("API"),
             transport(transport),
            firmware(
                logger,
                [this](const char *type, JsonObject payload)
                { return this->sendMessage(type, payload); },
                [this](const char *reason)
                { this->transport.forceReconnect(reason); },
                firmwareUpdateProgressCallback,
                firmwareUpdateMetaCallback,
                errorCallback) {}
