#ifdef DEMO_MODE

#include "demo_websocket.hpp"
#include "../state/state.hpp"
#include <ArduinoJson.h>
#include <cstring>
#include <cstdio>
#include <ctime>
#include <string>
#include <vector>

#include "demo_websocket_fixtures.hpp"


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

bool DemoWebsocket::sendMessage(const std::string &msg)
{
    return sendMessage(msg.c_str(), msg.size());
}

bool DemoWebsocket::sendMessage(const char *data, size_t len)
{
    processOutbound(data, len);
    return true;
}

bool DemoWebsocket::sendHeartbeat(const char *message, size_t length)
{
    return sendMessage(message, length);
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

    if (strcmp(type, "REQUEST_RESOURCE_LIST") == 0)
    {
        respondResourceList(doc["data"]["payload"]["requestId"] | 0u);
        return;
    }

    if (strcmp(type, "REQUEST_CARD_AUTHENTICATION_DATA") == 0)
    {
        const char *uid = doc["data"]["payload"]["uid"] | "";
        uint32_t resourceId = doc["data"]["payload"]["resourceId"] | 0u;
        respondCardAuth(std::string(uid), resourceId);
        return;
    }

    if (strcmp(type, "PROJECTS_OF_USER") == 0)
    {
        respondProjects(doc["data"]["payload"]["page"] | 1u);
        return;
    }

    if (strcmp(type, "START_RESOURCE_USAGE_SESSION") == 0 || strcmp(type, "STOP_RESOURCE_USAGE_SESSION") == 0 ||
        strcmp(type, "LOCK_DOOR") == 0 || strcmp(type, "UNLOCK_DOOR") == 0 ||
        strcmp(type, "UNLATCH_DOOR") == 0 || strcmp(type, "TRIGGER_FLOW_BUTTON") == 0)
        _actionRequestId = doc["data"]["payload"]["requestId"] | 0u;

    if (strcmp(type, "START_RESOURCE_USAGE_SESSION") == 0)
    {
        handleStartSession(doc["data"]["payload"]["resourceId"] | 0u,
                           doc["data"]["payload"]["projectId"] | 0u,
                           doc["data"]["payload"]["forceTakeOver"] | false);
        return;
    }

    if (strcmp(type, "STOP_RESOURCE_USAGE_SESSION") == 0)
    {
        handleStopSession(doc["data"]["payload"]["resourceId"] | 0u);
        return;
    }

    if (strcmp(type, "RESOURCE_USAGE_FORM_GET_FIELDS") == 0)
    {
        respondFormFields(doc["data"]["payload"]["resourceId"] | 0u,
                          doc["data"]["payload"]["action"] | "start",
                          doc["data"]["payload"]["formId"] | 0u,
                          doc["data"]["payload"]["offset"] | 0u);
        return;
    }

    if (strcmp(type, "RESOURCE_USAGE_FORM_SUBMIT_PAGE") == 0)
    {
        respondFormPageResult(doc["data"].as<JsonObjectConst>());
        return;
    }

    // Generic success for the remaining door/button actions
    if (strcmp(type, "LOCK_DOOR") == 0 ||
        strcmp(type, "UNLOCK_DOOR") == 0 ||
        strcmp(type, "UNLATCH_DOOR") == 0 ||
        strcmp(type, "TRIGGER_FLOW_BUTTON") == 0)
    {
        respondActionSuccess(type);
        return;
    }

    // All other outbound messages are silently ignored in demo mode
}

#endif
