#include "workflow.hpp"

// ATT-1189: several people use one machine. The production API parser, list,
// details and action flow run against hand-written RESOURCE_LIST payloads.
void ReaderWorkflow::testParallelSessions()
{
    click("Abmelden");
    struct Scenario { int limit; bool own; bool canStartFlag; std::vector<std::pair<int, const char *>> others; };
    const auto parallelList = [&](const Scenario &scenario) {
        JsonDocument doc;
        doc["messageId"] = ++listVersion;
        doc["revision"] = listVersion;
        if (server.count("REQUEST_RESOURCE_LIST"))
            doc["requestId"] = server.last("REQUEST_RESOURCE_LIST")["data"]["payload"]["requestId"].as<uint32_t>();
        doc["authenticatedUsername"] = username;
        auto resources = doc["resources"].to<JsonArray>();
        // A second row keeps the reader on its list instead of opening the only resource.
        auto door = resources.add<JsonObject>();
        door["id"] = 2; door["name"] = "Tür"; door["type"] = "door"; door["isHealthy"] = true; door["hasIntroduction"] = true;
        auto r = resources.add<JsonObject>();
        r["id"] = 1; r["name"] = "Drucker"; r["description"] = ""; r["type"] = "machine";
        r["isHealthy"] = true; r["hasIntroduction"] = true; r["requiresSupervisor"] = false;
        r["canManageResource"] = true; r["isIntroducer"] = true; r["allowTakeOver"] = false;
        r["maxParallelSessions"] = scenario.limit;
        auto all = r["activeUsageSessions"].to<JsonArray>();
        JsonObject newest;
        for (const auto &[id, user] : scenario.others) {
            newest = all.add<JsonObject>();
            newest["id"] = id; newest["user"]["username"] = user; newest["startTime"] = "2026-01-01T10:00:00Z";
        }
        if (scenario.own) {
            auto own = all.add<JsonObject>();
            own["id"] = 9; own["user"]["username"] = username; own["startTime"] = "2026-01-01T10:30:00Z";
            r["ownUsageSession"] = own;
            r["activeUsageSession"] = own;
        } else if (!newest.isNull()) {
            r["activeUsageSession"] = newest;
        }
        r["activeSessionCount"] = all.size();
        r["canStart"] = scenario.canStartFlag;
        std::string payload; serializeJson(doc, payload); server.push("RESOURCE_LIST", payload);
        pump();
    };
    const auto actionReply = [&](const char *type, const char *body) {
        const auto id = server.last(type)["data"]["payload"]["requestId"].as<uint32_t>();
        server.push(type, "{\"requestId\":" + std::to_string(id) + "," + body + "}");
        pump();
    };

    // A free slot on a busy machine: "In use 2/3" with a plain Start, never a takeover.
    supervised = false; active = false;
    login(false);
    parallelList({3, false, true, {{7, "Robin"}, {8, "Sam"}}});
    assert(label(lv_screen_active(), "In Verwendung 2/3"));
    display.capture(output, "parallel-01-list-in-use-k-of-n");
    const auto starts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Start");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    const auto startRequest = server.last("START_RESOURCE_USAGE_SESSION");
    const auto start = startRequest["data"]["payload"];
    assert(start["resourceId"].as<int>() == 1 && !start["forceTakeOver"].as<bool>());
    // The server refuses when someone else took the last slot meanwhile.
    actionReply("START_RESOURCE_USAGE_SESSION", R"("error":"ResourceFullError")");
    assert(label(lv_layer_top(), "Alle Plätze dieser Ressource sind belegt."));
    Display::hidePopup();
    parallelList({3, false, false, {{7, "Robin"}, {8, "Sam"}, {10, "Kim"}}});
    assert(label(lv_screen_active(), "Voll"));
    assert(!label(lv_screen_active(), "Start"));
    display.capture(output, "parallel-02-list-full");

    // Details: introducers/managers pick exactly one other session to end.
    click("Drucker");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(label(lv_screen_active(), "Sitzung von Robin beenden"));
    assert(label(lv_screen_active(), "Sitzung von Sam beenden"));
    assert(label(lv_screen_active(), "Sitzung von Kim beenden"));
    display.capture(output, "parallel-03-details-picker");
    const auto stops = server.count("STOP_RESOURCE_USAGE_SESSION");
    click("Sitzung von Sam beenden");
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stops + 1);
    const auto forceStopRequest = server.last("STOP_RESOURCE_USAGE_SESSION");
    const auto forceStop = forceStopRequest["data"]["payload"];
    assert(forceStop["resourceId"].as<int>() == 1 && forceStop["usageId"].as<int>() == 8);
    actionReply("STOP_RESOURCE_USAGE_SESSION", R"("success":true,"endedOwnSession":false)");
    parallelList({3, false, true, {{7, "Robin"}, {10, "Kim"}}});

    // My own session: "In use by you" and Stop, which never names a usageId.
    parallelList({3, true, false, {{7, "Robin"}, {10, "Kim"}}});
    assert(label(lv_screen_active(), "Sitzung beenden"));
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Ressource verwenden")));
    display.capture(output, "parallel-04-details-own-session");
    click("Sitzung beenden");
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stops + 2);
    assert(server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["usageId"].isNull());
    actionReply("STOP_RESOURCE_USAGE_SESSION", R"("error":"Stop denied")");
    Display::hidePopup();

    // Limit 1 is unchanged: foreign session, classic wording, force-stop without usageId.
    parallelList({1, false, false, {{7, "Robin"}}});
    assert(label(lv_screen_active(), "Fremde Sitzung beenden"));
    assert(!label(lv_screen_active(), "Sitzung von Robin beenden"));
    click("Fremde Sitzung beenden");
    assert(server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["usageId"].isNull());
    actionReply("STOP_RESOURCE_USAGE_SESSION", R"("error":"Stop denied")");
    Display::hidePopup();
    parallelList({1, false, false, {{7, "Robin"}}});
    click(LV_SYMBOL_LEFT);
    assert(label(lv_screen_active(), "In Verwendung: Robin"));
    click("Abmelden");
    username = "Alex";
    login();
}
