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
// Stateful demo handlers
// ---------------------------------------------------------------------------

int DemoWebsocket::sessionIndexForResource(uint32_t resourceId)
{
    for (uint8_t i = 0; i < DemoStore::getResourceCount(); i++)
    {
        if (DemoStore::getResource(i).id == resourceId)
            return i;
    }
    return -1;
}

void DemoWebsocket::respondProjects(uint32_t page)
{
    if (page == 0)
        page = 1;

    StaticJsonDocument<1024> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "PROJECTS_OF_USER";
    doc["data"]["payload"]["page"] = page;
    doc["data"]["payload"]["limit"] = DEMO_PROJECT_PAGE_SIZE;
    doc["data"]["payload"]["total"] = DEMO_PROJECT_COUNT;

    JsonArray projects = doc["data"]["payload"]["projects"].to<JsonArray>();
    uint32_t start = (page - 1) * DEMO_PROJECT_PAGE_SIZE;
    for (uint32_t i = start; i < start + DEMO_PROJECT_PAGE_SIZE && i < DEMO_PROJECT_COUNT; i++)
    {
        JsonObject obj = projects.createNestedObject();
        obj["id"] = i + 1;
        obj["name"] = DEMO_PROJECTS[i];
    }

    char buf[1024];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

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
    if (idx >= 0)
        _sessions[idx] = DemoSession{};

    respondActionSuccess("STOP_RESOURCE_USAGE_SESSION");
    respondResourceList();
}

#endif
