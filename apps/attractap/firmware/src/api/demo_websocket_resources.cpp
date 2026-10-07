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

void DemoWebsocket::respondAuthenticated()
{
    StaticJsonDocument<256> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "READER_AUTHENTICATED";
    doc["data"]["payload"]["name"] = "Demo Gerät";

    char buf[256];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));

    respondResourceList();
}

void DemoWebsocket::respondResourceList(uint32_t requestId)
{
    StaticJsonDocument<3072> doc;
    doc["event"] = "EVENT";
    doc["data"]["type"] = "RESOURCE_LIST";
    doc["data"]["payload"]["messageId"] = ++_resourceListMsgId;
    doc["data"]["payload"]["revision"] = _resourceListMsgId;
    doc["data"]["payload"]["requestId"] = requestId;
    doc["data"]["payload"]["authenticatedUsername"] = _currentUser;
    doc["data"]["payload"]["readerName"] = "Demo Gerät";

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
        if (!_currentUser.empty()) {
            obj["hasIntroduction"] = _currentHasIntroduction;
            obj["canManageResource"] = _currentCanManage;
            obj["isIntroducer"] = _currentCanManage;
            obj["canManageMaintenance"] = _currentCanManage;
            obj["requiresSupervisor"] = false;
        }
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
    _currentHasIntroduction = (card.role != DemoStore::UserRole::NO_PERMISSION);
    respondResourceList();

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
    doc["data"]["payload"]["requestId"] = _actionRequestId;

    char buf[256];
    size_t n = serializeJson(doc, buf, sizeof(buf));
    if (n > 0)
        enqueue(std::string(buf, n));
}

#endif
