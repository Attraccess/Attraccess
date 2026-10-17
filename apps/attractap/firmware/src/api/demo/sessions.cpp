#ifdef DEMO_MODE
#include "websocket.hpp"
#include "fixtures.hpp"
#include <ArduinoJson.h>
#include <ctime>
#include <string>

void DemoWebsocket::handleStartSession(uint32_t resourceId, uint32_t projectId, bool forceTakeOver)
{
    (void)projectId; // recorded implicitly via the owner; not surfaced back in demo
    int idx = sessionIndexForResource(resourceId);
    if (idx < 0)
        return;
    DemoSession &session = _sessions[idx];

    // Another user is active and this is not a takeover: mirror the server's
    // ResourceInUseError by re-pushing the resource list so the client shows the
    // occupied state (non-managers stay blocked, managers get a force-stop).
    if (session.active && !forceTakeOver && session.user != _currentUser)
    {
        respondResourceList();
        return;
    }

    // The CNC requires its start form to be completed first.
    if (resourceId == CNC_RESOURCE_ID && !forceTakeOver && !cncFormComplete())
    {
        respondFormRequest(resourceId);
        return;
    }

    session.active = true;
    session.user = _currentUser;
    session.startEpoch = time(nullptr);
    _cncDraft.clear();

    respondActionSuccess("START_RESOURCE_USAGE_SESSION");
    respondResourceList();
}

void DemoWebsocket::handleStopSession(uint32_t resourceId)
{
    int idx = sessionIndexForResource(resourceId);
    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "STOP_RESOURCE_USAGE_SESSION";
    auto payload = doc["data"]["payload"].to<JsonObject>();
    payload["success"] = true;
    payload["requestId"] = _actionRequestId;
    payload["endedOwnSession"] = idx >= 0 && _sessions[idx].active && _sessions[idx].user == _currentUser;
    if (idx >= 0 && _sessions[idx].active) {
        const auto elapsed = time(nullptr) - _sessions[idx].startEpoch;
        payload["durationSeconds"] = elapsed > 0 ? elapsed : 0;
    }
    if (idx >= 0) _sessions[idx] = DemoSession{};
    std::string response;
    serializeJson(doc, response);
    enqueue(response);
    respondResourceList();
}

#endif
