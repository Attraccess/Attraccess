#ifdef DEMO_MODE

#include "demo_websocket.hpp"
#include "../state/state.hpp"
#include <ArduinoJson.h>
#include <cstring>

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

void DemoWebsocket::setup()
{
    // Mark the mock as "connected" so the application state machine can
    // advance past the init screen without any real network.
    esp_ip4_addr_t fakeIp = {0};
    State::setWifiState(true, fakeIp, "Demo");
    State::setWebsocketState(true, "demo-local", 0, false);
    State::setWebsocketPhase(State::WS_CONNECTED);
}

void DemoWebsocket::loop()
{
    if (!_initDone)
    {
        _initDone = true;
        // Kick off the auth handshake once callbacks are registered.
        enqueue(R"({"event":"EVENT","data":{"type":"READER_REQUEST_AUTHENTICATION","payload":{}}})");
    }

    while (!_inbound.empty() && _messageCallback)
    {
        std::string msg = std::move(_inbound.front());
        _inbound.pop();
        _messageCallback(msg.c_str(), msg.size());
    }
}

// ---------------------------------------------------------------------------
// Outbound (API → mock)
// ---------------------------------------------------------------------------

void DemoWebsocket::sendMessage(const std::string &msg)
{
    sendMessage(msg.c_str(), msg.size());
}

void DemoWebsocket::sendMessage(const char *data, size_t len)
{
    processOutbound(data, len);
}

void DemoWebsocket::setMessageCallbackRaw(std::function<void(const char *, size_t)> cb)
{
    _messageCallback = cb;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

void DemoWebsocket::enqueue(const std::string &msg)
{
    _inbound.push(msg);
}

void DemoWebsocket::processOutbound(const char *data, size_t len)
{
    StaticJsonDocument<1024> doc;
    if (deserializeJson(doc, data, len) != DeserializationError::Ok)
        return;

    // Ignore heartbeats and ACKs
    const char *topEvent = doc["event"] | "";
    if (strcmp(topEvent, "HEARTBEAT") == 0)
        return;

    const char *type = doc["data"]["type"] | "";
    if (strncmp(type, "ACK_", 4) == 0)
        return;

    _logger.debugf("Demo mock received: %s", type);

    if (strcmp(type, "READER_REGISTER") == 0)
    {
        // Respond with a registration response that contains an id and token
        enqueue(R"({"event":"EVENT","data":{"type":"READER_REGISTER","payload":{"id":1,"token":"demo-token"}}})");
        return;
    }

    if (strcmp(type, "READER_AUTHENTICATE") == 0)
    {
        respondAuthenticated();
        return;
    }

    if (strcmp(type, "REQUEST_CARD_AUTHENTICATION_DATA") == 0)
    {
        const char *uid = doc["data"]["payload"]["uid"] | "";
        uint32_t resourceId = doc["data"]["payload"]["resourceId"] | 0u;
        respondCardAuth(std::string(uid), resourceId);
        return;
    }

    // Generic success for all session/door/button actions
    if (strcmp(type, "START_RESOURCE_USAGE_SESSION") == 0 ||
        strcmp(type, "STOP_RESOURCE_USAGE_SESSION") == 0 ||
        strcmp(type, "LOCK_DOOR") == 0 ||
        strcmp(type, "UNLOCK_DOOR") == 0 ||
        strcmp(type, "UNLATCH_DOOR") == 0 ||
        strcmp(type, "TRIGGER_FLOW_BUTTON") == 0)
    {
        respondActionSuccess(type);
        return;
    }

    // All other outbound messages are silently ignored in demo mode
}

void DemoWebsocket::respondAuthenticated()
{
    StaticJsonDocument<256> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "READER_AUTHENTICATED";
    doc["data"]["payload"]["name"] = "Demo Geraet";

    char buf[256];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));

    respondResourceList();
}

void DemoWebsocket::respondResourceList()
{
    StaticJsonDocument<1024> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "RESOURCE_LIST";
    doc["data"]["payload"]["messageId"] = 1;
    doc["data"]["payload"]["readerName"] = "Demo Geraet";

    JsonArray resources = doc["data"]["payload"]["resources"].to<JsonArray>();
    for (uint8_t i = 0; i < DemoStore::getResourceCount(); i++)
    {
        const DemoStore::DemoResource &r = DemoStore::getResource(i);
        JsonObject obj = resources.createNestedObject();
        obj["id"] = r.id;
        obj["name"] = r.name;
        obj["description"] = "Demo Ressource";
        obj["type"] = (r.type == 1) ? "door" : "machine";
        obj["isHealthy"] = true;
        obj["isUnderMaintenance"] = false;
        obj["separateUnlockAndUnlatch"] = false;
        obj["allowTakeOver"] = false;
    }

    char buf[1024];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

void DemoWebsocket::respondCardAuth(const std::string &uidHex, uint32_t resourceId)
{
    StaticJsonDocument<512> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "CARD_AUTHENTICATION_DATA";

    DemoStore::DemoCard card;
    if (!DemoStore::findCard(uidHex.c_str(), card))
    {
        _logger.infof("Card %s not in demo store", uidHex.c_str());
        doc["data"]["payload"]["error"] = "CARD_NOT_ENROLLED";
        char buf[256];
        size_t n = serializeJson(doc, buf, sizeof(buf));
        if (n > 0)
            enqueue(std::string(buf, n));
        return;
    }

    if (card.role == DemoStore::UserRole::NO_PERMISSION)
    {
        doc["data"]["payload"]["error"] = "ACCESS_DENIED";
        char buf[256];
        size_t n = serializeJson(doc, buf, sizeof(buf));
        if (n > 0)
            enqueue(std::string(buf, n));
        return;
    }

    // Always return the factory key (all zeros) — demo cards are never physically enrolled.
    doc["data"]["payload"]["keyNo"] = 0;
    doc["data"]["payload"]["key"] = "00000000000000000000000000000000";
    doc["data"]["payload"]["username"] = (card.label[0] != '\0') ? card.label : "Demo User";
    doc["data"]["payload"]["canManageResource"] = (card.role == DemoStore::UserRole::ADMIN);
    doc["data"]["payload"]["hasIntroduction"] = true;
    doc["data"]["payload"]["isIntroducer"] = (card.role == DemoStore::UserRole::ADMIN);
    doc["data"]["payload"]["supervisionMode"] = "none";
    doc["data"]["payload"]["requiresSupervisor"] = false;

    char buf[512];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

void DemoWebsocket::respondActionSuccess(const std::string &type)
{
    StaticJsonDocument<256> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = type;
    doc["data"]["payload"]["success"] = true;

    char buf[256];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

#endif // DEMO_MODE
