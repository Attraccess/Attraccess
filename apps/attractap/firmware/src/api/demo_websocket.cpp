#ifdef DEMO_MODE

#include "demo_websocket.hpp"
#include "../state/state.hpp"
#include <ArduinoJson.h>
#include <cstring>
#include <cstdio>
#include <ctime>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// Demo fixtures: fake projects + the CNC start form
// ---------------------------------------------------------------------------

namespace
{
    // A handful of fake projects to pick from in the project selector.
    const char *const DEMO_PROJECTS[] = {
        "Moebelbau Eiche",
        "Prototyp Gehaeuse",
        "Reparatur Fahrradrahmen",
        "Weihnachtsgeschenke",
        "CNC Schild Gravur",
        "Ersatzteil Drucker",
    };
    constexpr uint32_t DEMO_PROJECT_COUNT = sizeof(DEMO_PROJECTS) / sizeof(DEMO_PROJECTS[0]);
    constexpr uint32_t DEMO_PROJECT_PAGE_SIZE = 4;

    // Start form shown when a session on the CNC (resource id 1) begins.
    constexpr uint32_t CNC_RESOURCE_ID = 1;
    constexpr uint32_t CNC_FORM_ID = 10;

    struct CncField
    {
        uint32_t id;
        const char *name;
        const char *description;
        const char *type; // text | number | boolean | select
        bool required;
    };
    const CncField CNC_FIELDS[] = {
        {101, "Material", "Werkstoff des Werkstuecks", "select", true},
        {102, "Auftragsnummer", "Interne Auftrags-ID", "text", true},
        {103, "Geschaetzte Laufzeit (Min)", "Optional", "number", false},
        {104, "Absaugung geprueft", "Spaeneabsaugung aktiv?", "boolean", true},
    };
    constexpr uint32_t CNC_FIELD_COUNT = sizeof(CNC_FIELDS) / sizeof(CNC_FIELDS[0]);
    const char *const CNC_MATERIALS[] = {"Aluminium", "Holz", "Kunststoff", "Messing", "Stahl"};

    std::string toIso8601(time_t t)
    {
        struct tm tmv;
        gmtime_r(&t, &tmv);
        char buf[24];
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tmv);
        return std::string(buf);
    }
} // namespace

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

    if (strcmp(type, "PROJECTS_OF_USER") == 0)
    {
        respondProjects(doc["data"]["payload"]["page"] | 1u);
        return;
    }

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
    StaticJsonDocument<3072> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "RESOURCE_LIST";
    doc["data"]["payload"]["messageId"] = ++_resourceListMsgId;
    doc["data"]["payload"]["readerName"] = "Demo Geraet";

    // Introducers = enrolled admin cards (they can introduce others). Shown in
    // the "not introduced" panel when a no-permission card taps a resource.
    std::vector<std::string> introducers;
    for (uint8_t i = 0; i < DemoStore::getCardCount(); i++)
    {
        const DemoStore::DemoCard &c = DemoStore::getCard(i);
        if (c.role == DemoStore::UserRole::ADMIN)
            introducers.push_back(DemoStore::displayName(c));
    }
    if (introducers.empty())
        introducers.push_back("Demo Admin");

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
        // Takeover stays disabled: another user's session blocks non-managers,
        // while admins (canManageResource) can still force-stop it.
        obj["allowTakeOver"] = false;
        JsonArray intro = obj["introducers"].to<JsonArray>();
        for (const std::string &name : introducers)
            intro.add(name);

        const DemoSession &session = _sessions[i];
        if (session.active)
        {
            JsonObject aus = obj["activeUsageSession"].to<JsonObject>();
            aus["user"]["username"] = session.user;
            aus["startTime"] = toIso8601(session.startEpoch);
            aus["startTimeUtcOffsetMinutes"] = 0;
        }
    }

    char buf[3072];
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

    // Every enrolled card authenticates and unlocks — the real API has no
    // "access denied" card state. A user without an introduction still unlocks;
    // the resource-details screen then shows the standard "not introduced,
    // contact an introducer" panel (driven by hasIntroduction=false).
    // Remember who tapped so START/STOP can be attributed to the current user.
    _currentUser = DemoStore::displayName(card);
    _currentCanManage = (card.role == DemoStore::UserRole::ADMIN);

    // Always return the factory key (all zeros) — demo cards are never physically enrolled.
    doc["data"]["payload"]["keyNo"] = 0;
    doc["data"]["payload"]["key"] = "00000000000000000000000000000000";
    doc["data"]["payload"]["username"] = DemoStore::displayName(card);
    doc["data"]["payload"]["canManageResource"] = (card.role == DemoStore::UserRole::ADMIN);
    doc["data"]["payload"]["hasIntroduction"] = (card.role != DemoStore::UserRole::NO_PERMISSION);
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

bool DemoWebsocket::cncFormComplete() const
{
    for (uint32_t i = 0; i < CNC_FIELD_COUNT; i++)
    {
        if (!CNC_FIELDS[i].required)
            continue;
        auto it = _cncDraft.find(CNC_FIELDS[i].id);
        if (it == _cncDraft.end() || it->second.empty())
            return false;
    }
    return true;
}

void DemoWebsocket::respondFormRequest(uint32_t resourceId)
{
    StaticJsonDocument<512> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "RESOURCE_USAGE_FORM_REQUEST";
    doc["data"]["payload"]["resourceId"] = resourceId;
    doc["data"]["payload"]["resourceName"] = "CNC Fraese";
    doc["data"]["payload"]["action"] = "start";

    JsonArray forms = doc["data"]["payload"]["forms"].to<JsonArray>();
    JsonObject form = forms.createNestedObject();
    form["id"] = CNC_FORM_ID;
    form["name"] = "CNC Einrichtung";
    form["fieldCount"] = CNC_FIELD_COUNT;

    char buf[512];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

void DemoWebsocket::respondFormFields(uint32_t resourceId, const char *action, uint32_t formId, uint32_t offset)
{
    StaticJsonDocument<768> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "RESOURCE_USAGE_FORM_FIELDS";
    doc["data"]["payload"]["resourceId"] = resourceId;
    doc["data"]["payload"]["action"] = action;
    doc["data"]["payload"]["formId"] = formId;
    doc["data"]["payload"]["offset"] = offset;
    doc["data"]["payload"]["totalFieldCount"] = CNC_FIELD_COUNT;

    JsonArray fields = doc["data"]["payload"]["fields"].to<JsonArray>();
    // The client fetches a one-field window (MAX_FORM_PAGE_FIELDS == 1).
    if (offset < CNC_FIELD_COUNT)
    {
        const CncField &f = CNC_FIELDS[offset];
        JsonObject obj = fields.createNestedObject();
        obj["id"] = f.id;
        obj["name"] = f.name;
        obj["description"] = f.description;
        obj["type"] = f.type;
        obj["isRequired"] = f.required;

        if (strcmp(f.type, "select") == 0)
        {
            JsonArray options = obj["options"].to<JsonArray>();
            for (const char *material : CNC_MATERIALS)
                options.add(material);
        }
        else if (strcmp(f.type, "number") == 0)
        {
            // Doubles: the client parses these via is<double>().
            obj["options"]["min"] = 1.0;
            obj["options"]["max"] = 480.0;
            obj["options"]["step"] = 1.0;
        }
        else if (strcmp(f.type, "text") == 0)
        {
            obj["options"]["placeholder"] = "z.B. 2024-042";
        }

        auto draft = _cncDraft.find(f.id);
        if (draft != _cncDraft.end())
            obj["value"] = draft->second;
    }

    char buf[768];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

void DemoWebsocket::respondFormPageResult(JsonObjectConst data)
{
    JsonObjectConst payload = data["payload"];
    uint32_t resourceId = payload["resourceId"] | 0u;
    const char *action = payload["action"] | "start";
    uint32_t formId = payload["formId"] | 0u;
    uint32_t offset = payload["offset"] | 0u;

    StaticJsonDocument<512> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "RESOURCE_USAGE_FORM_PAGE_RESULT";
    doc["data"]["payload"]["resourceId"] = resourceId;
    doc["data"]["payload"]["action"] = action;
    doc["data"]["payload"]["formId"] = formId;
    doc["data"]["payload"]["offset"] = offset;
    JsonArray errors = doc["data"]["payload"]["errors"].to<JsonArray>();

    JsonArrayConst answers = payload["answers"];
    for (JsonObjectConst answer : answers)
    {
        uint32_t fieldId = answer["fieldId"] | 0u;

        // Normalize the answer value to a string for the draft / emptiness check.
        std::string value;
        JsonVariantConst v = answer["value"];
        if (v.is<bool>())
            value = v.as<bool>() ? "true" : "false";
        else if (v.is<const char *>())
            value = v.as<const char *>() ? v.as<const char *>() : "";
        else if (v.is<double>())
        {
            char numBuf[32];
            snprintf(numBuf, sizeof(numBuf), "%.0f", v.as<double>());
            value = numBuf;
        }

        // Required-field validation, matching the real server's rejection.
        bool required = false;
        for (uint32_t i = 0; i < CNC_FIELD_COUNT; i++)
        {
            if (CNC_FIELDS[i].id == fieldId)
            {
                required = CNC_FIELDS[i].required;
                break;
            }
        }
        if (required && value.empty())
        {
            JsonObject err = errors.createNestedObject();
            err["fieldId"] = fieldId;
            err["message"] = "Pflichtfeld";
            continue;
        }
        _cncDraft[fieldId] = value;
    }

    doc["data"]["payload"]["valid"] = (errors.size() == 0);

    char buf[512];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

#endif // DEMO_MODE
