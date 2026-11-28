#include "../../demo/demo_localization.hpp"
#ifdef DEMO_MODE

#include "websocket.hpp"
#include "../../state/state.hpp"
#include <ArduinoJson.h>
#include <cctype>
#include <cstring>
#include <cstdio>
#include <string>
#include <vector>

#include "fixtures.hpp"

// ---------------------------------------------------------------------------
// Stateful demo handlers: resource lookup and the project picker
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

static bool demoProjectMatches(const char *name, const std::string &search)
{
    std::string haystack(name);
    std::string needle(search);
    for (auto *text : {&haystack, &needle})
        for (char &c : *text)
            c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return haystack.find(needle) != std::string::npos;
}

// The demo's project ids start at 1; 0 and unknown ids mean no project.
static const char *demoProjectName(uint32_t projectId, bool english)
{
    if (projectId == 0 || projectId > DEMO_PROJECT_COUNT)
        return nullptr;
    return DemoLocalization::projectName(projectId - 1, english);
}

void DemoWebsocket::addProjectSwitchOffer(JsonObject resource, const DemoSession &own, bool english) const
{
    resource["canSwitchProject"] = true;
    resource["ownProjectId"] = own.projectId;
    if (const char *name = demoProjectName(own.projectId, english))
        resource["ownProjectName"] = name;
    else
        resource["ownProjectName"] = nullptr;
    resource["ownSessionContinued"] = own.continuation;
}

void DemoWebsocket::handleSwitchProject(JsonObjectConst payload)
{
    const int idx = sessionIndexForResource(payload["resourceId"] | 0u);
    const uint32_t usageId = payload["usageId"] | 0u;
    const uint32_t projectId = payload["projectId"] | 0u;
    const std::string mode = payload["mode"] | "";
    const bool split = mode == "split";
    DemoSession *own = nullptr;
    bool ownRuns = false;
    if (idx >= 0)
        for (DemoSession &session : _sessions[idx])
            if (isOwnSession(session))
            {
                ownRuns = true;
                if (usageId == 0 || session.id == usageId)
                    own = &session;
            }
    // The server's replies (project-switch.handler.ts): a named record that a switch replaced while the card holder's
    // session runs on is a changed session, not a missing one.
    const char *refusal = !split && mode != "whole-session" ? "INVALID_PROJECT_CHANGE_MODE"
                          : projectId > DEMO_PROJECT_COUNT ? "Project not found"
                          : !own ? (ownRuns ? "PROJECT_SWITCH_SESSION_CHANGED" : "NoOwnActiveSessionError")
                          : own->projectId == projectId ? "The session already belongs to this project"
                                                        : nullptr;
    if (refusal)
    {
        respondActionError("SWITCH_SESSION_PROJECT", refusal);
        respondResourceList();
        return;
    }

    // Like the server: a split continues the session as a new usage record, while moving the whole session keeps the
    // record. The reader keeps the session's start and deadline either way.
    if (split)
    {
        own->id = _nextSessionId++;
        own->continuation = true;
    }
    own->projectId = projectId;

    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "SWITCH_SESSION_PROJECT";
    auto reply = doc["data"]["payload"].to<JsonObject>();
    reply["success"] = true;
    reply["requestId"] = _actionRequestId;
    reply["usageId"] = own->id;
    if (const char *name = demoProjectName(projectId, State::getActiveLanguage() == "en"))
        reply["projectName"] = name;
    else
        reply["projectName"] = nullptr;
    std::string out;
    serializeJson(doc, out);
    enqueue(out);
    respondResourceList();
}

void DemoWebsocket::respondProjects(uint32_t page, const std::string &search)
{
    if (page == 0)
        page = 1;

    const bool english = State::getActiveLanguage() == "en";
    std::vector<uint32_t> matches;
    for (uint32_t i = 0; i < DEMO_PROJECT_COUNT; i++)
    {
        if (demoProjectMatches(DemoLocalization::projectName(i, english), search))
            matches.push_back(i);
    }

    StaticJsonDocument<1024> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "PROJECTS_OF_USER";
    doc["data"]["payload"]["page"] = page;
    doc["data"]["payload"]["limit"] = DEMO_PROJECT_PAGE_SIZE;
    doc["data"]["payload"]["total"] = matches.size();
    doc["data"]["payload"]["search"] = search;

    JsonArray projects = doc["data"]["payload"]["projects"].to<JsonArray>();
    uint32_t start = (page - 1) * DEMO_PROJECT_PAGE_SIZE;
    for (uint32_t i = start; i < start + DEMO_PROJECT_PAGE_SIZE && i < matches.size(); i++)
    {
        JsonObject obj = projects.createNestedObject();
        obj["id"] = matches[i] + 1;
        obj["name"] = DemoLocalization::projectName(matches[i], english);
    }

    char buf[1024];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

#endif
