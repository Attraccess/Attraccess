#ifdef DEMO_MODE
#include "websocket.hpp"
#include "fixtures.hpp"
#include "clock.hpp"
#include <ArduinoJson.h>
#include <algorithm>
#include <ctime>
#include <string>

uint16_t DemoWebsocket::maxParallelSessionsFor(uint32_t resourceId)
{
    // The 3D printer is the shared demo machine; the CNC stays a classic single-session machine.
    return resourceId == 2 ? 3 : 1;
}

void DemoWebsocket::addSessionJson(JsonObject target, const DemoSession &session) const
{
    target["id"] = session.id;
    target["user"]["username"] = session.user;
    target["startTime"] = toIso8601(session.startEpoch);
    target["startTimeUtcOffsetMinutes"] = DemoClock::utcOffsetMinutes(session.startEpoch);
}

void DemoWebsocket::respondActionError(const std::string &type, const char *error)
{
    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = type;
    doc["data"]["payload"]["error"] = error;
    doc["data"]["payload"]["requestId"] = _actionRequestId;
    std::string out;
    serializeJson(doc, out);
    enqueue(out);
}

void DemoWebsocket::handleStartSession(uint32_t resourceId, uint32_t projectId, bool forceTakeOver)
{
    (void)projectId; // recorded implicitly via the owner; not surfaced back in demo
    int idx = sessionIndexForResource(resourceId);
    if (idx < 0)
        return;
    std::vector<DemoSession> &sessions = _sessions[idx];
    const uint16_t limit = maxParallelSessionsFor(resourceId);

    // Mirror the server's refusals and re-push the list so the client shows the
    // occupied state: single-session machines report ResourceInUseError, shared
    // machines ResourceFullError / AlreadyHasActiveSessionError.
    if (limit <= 1)
    {
        if (!sessions.empty() && !forceTakeOver && sessions.front().user != _currentUser)
        {
            respondActionError("START_RESOURCE_USAGE_SESSION", "ResourceInUseError");
            respondResourceList();
            return;
        }
    }
    else
    {
        const bool hasOwn = std::any_of(sessions.begin(), sessions.end(),
                                        [this](const DemoSession &s) { return isOwnSession(s); });
        if (hasOwn && !_currentUser.empty())
        {
            respondActionError("START_RESOURCE_USAGE_SESSION", "AlreadyHasActiveSessionError");
            respondResourceList();
            return;
        }
        if (sessions.size() >= limit)
        {
            respondActionError("START_RESOURCE_USAGE_SESSION", "ResourceFullError");
            respondResourceList();
            return;
        }
    }

    // The CNC requires its start form to be completed first.
    if (resourceId == CNC_RESOURCE_ID && !forceTakeOver && !cncFormComplete())
    {
        respondFormRequest(resourceId);
        return;
    }

    // Takeover only exists at limit 1 and replaces the running session.
    if (limit <= 1)
        sessions.clear();
    DemoSession session;
    session.id = _nextSessionId++;
    session.user = _currentUser;
    session.startEpoch = time(nullptr);
    sessions.push_back(session);
    _cncDraft.clear();

    respondActionSuccess("START_RESOURCE_USAGE_SESSION");
    respondResourceList();
}

void DemoWebsocket::handleStopSession(uint32_t resourceId, uint32_t usageId)
{
    int idx = sessionIndexForResource(resourceId);
    std::vector<DemoSession> *sessions = idx >= 0 ? &_sessions[idx] : nullptr;
    auto target = sessions ? sessions->end() : std::vector<DemoSession>::iterator();
    if (sessions)
    {
        if (usageId != 0)
            target = std::find_if(sessions->begin(), sessions->end(), [usageId](const DemoSession &s) { return s.id == usageId; });
        else
        {
            // Without usageId the card holder's own session ends; only a single-session
            // machine running exactly one session falls back to it (limit-1 force-stop).
            target = std::find_if(sessions->begin(), sessions->end(), [this](const DemoSession &s) { return isOwnSession(s); });
            if (target == sessions->end() && maxParallelSessionsFor(resourceId) <= 1 && sessions->size() == 1)
                target = sessions->begin();
            else if (target == sessions->end() && !sessions->empty())
            {
                respondActionError("STOP_RESOURCE_USAGE_SESSION", "NoOwnActiveSessionError");
                respondResourceList();
                return;
            }
        }
    }
    if (!sessions || target == sessions->end())
    {
        respondActionError("STOP_RESOURCE_USAGE_SESSION", "No active session found");
        respondResourceList();
        return;
    }
    if (!isOwnSession(*target) && !_currentCanManage)
    {
        respondActionError("STOP_RESOURCE_USAGE_SESSION", "You are not authorized to end this session");
        return;
    }

    JsonDocument doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "STOP_RESOURCE_USAGE_SESSION";
    auto payload = doc["data"]["payload"].to<JsonObject>();
    payload["success"] = true;
    payload["requestId"] = _actionRequestId;
    payload["endedOwnSession"] = isOwnSession(*target);
    const auto elapsed = time(nullptr) - target->startEpoch;
    payload["durationSeconds"] = elapsed > 0 ? elapsed : 0;
    sessions->erase(target);
    std::string response;
    serializeJson(doc, response);
    enqueue(response);
    respondResourceList();
}

#endif
