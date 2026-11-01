#include "workflow.hpp"

// ATT-1189: several people use one machine. The production API parser, list,
// details and action flow run against hand-written RESOURCE_LIST payloads.
void ReaderWorkflow::testParallelSessions()
{
    click("Abmelden");
    struct Scenario {
        int limit; bool own; bool canStartFlag; std::vector<std::pair<int, const char *>> others;
        bool manager = true;        // introducer + resource manager
        bool canEndOthers = false;  // canEndOtherSessions without either role
        bool ownShown = true;       // activeUsageSession names the own session (the server's choice)
    };
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
        r["canManageResource"] = scenario.manager; r["isIntroducer"] = scenario.manager; r["allowTakeOver"] = false;
        r["canEndOtherSessions"] = scenario.canEndOthers;
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
            r["activeUsageSession"] = scenario.ownShown || newest.isNull() ? own : newest;
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
    assert(label(lv_layer_top(), "Diese Maschine ist voll. Bitte versuchen Sie es erneut, wenn jemand fertig ist."));
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

    // A crowded machine lists at most 16 sessions (reader memory bound); the rest stay unlisted.
    std::vector<std::string> crowdNames;
    for (int i = 1; i <= 18; ++i) crowdNames.push_back("U" + std::to_string(i));
    Scenario crowded{20, false, false, {}};
    for (int i = 0; i < 18; ++i) crowded.others.push_back({100 + i, crowdNames[i].c_str()});
    parallelList(crowded);
    assert(label(lv_screen_active(), "Sitzung von U1 beenden"));
    assert(label(lv_screen_active(), "Sitzung von U16 beenden"));
    assert(!label(lv_screen_active(), "Sitzung von U17 beenden"));
    assert(!label(lv_screen_active(), "Sitzung von U18 beenden"));

    // The server refuses a stop without usageId when the card holder has no own session.
    parallelList({3, false, false, {{7, "Robin"}, {10, "Kim"}, {11, "Lee"}}});
    click("Sitzung von Kim beenden");
    actionReply("STOP_RESOURCE_USAGE_SESSION", R"("error":"NoOwnActiveSessionError")");
    assert(label(lv_layer_top(), "Sie haben keine aktive Sitzung an dieser Maschine."));
    Display::hidePopup();

    // Ownership follows the own session the server names, even when another session is shown.
    parallelList({3, true, false, {{7, "Robin"}, {10, "Kim"}}, true, false, false});
    assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Sitzung beenden")));
    assert(label(lv_screen_active(), "Sitzung von Robin beenden"));
    assert(label(lv_screen_active(), "Sitzung von Kim beenden"));
    assert(!label(lv_screen_active(), (std::string("Sitzung von ") + username + " beenden").c_str()));
    click("Sitzung beenden");
    assert(server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["usageId"].isNull());
    actionReply("STOP_RESOURCE_USAGE_SESSION", R"("error":"Stop denied")");
    Display::hidePopup();

    // A card that may only end other sessions (no introducer/manager role) still gets the picker.
    parallelList({3, false, false, {{7, "Robin"}, {10, "Kim"}, {11, "Lee"}}, false, true});
    assert(label(lv_screen_active(), "Andere Sitzung beenden:"));
    assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Sitzung von Lee beenden")));
    click("Sitzung von Lee beenden");
    assert(server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["usageId"].as<int>() == 11);
    actionReply("STOP_RESOURCE_USAGE_SESSION", R"("error":"Stop denied")");
    Display::hidePopup();
    parallelList({3, false, false, {{7, "Robin"}, {10, "Kim"}, {11, "Lee"}}, false, false});
    assert(!label(lv_screen_active(), "Sitzung von Lee beenden") ||
           !lv_obj_is_visible(requireLabel(lv_screen_active(), "Sitzung von Lee beenden")));

    // The limit was lowered to 1 while two sessions run: list each so either can be ended.
    parallelList({1, false, false, {{7, "Robin"}, {12, "Sam"}}});
    assert(label(lv_screen_active(), "Voll"));
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Ressource verwenden")));
    assert(label(lv_screen_active(), "Sitzung von Robin beenden"));
    assert(label(lv_screen_active(), "Sitzung von Sam beenden"));
    assert(!label(lv_screen_active(), "Fremde Sitzung beenden") ||
           !lv_obj_is_visible(requireLabel(lv_screen_active(), "Fremde Sitzung beenden")));
    display.capture(output, "parallel-05-details-lowered-limit");
    click("Sitzung von Robin beenden");
    assert(server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["usageId"].as<int>() == 7);
    actionReply("STOP_RESOURCE_USAGE_SESSION", R"("success":true,"endedOwnSession":false)");
    parallelList({1, false, false, {{12, "Sam"}}});
    click(LV_SYMBOL_LEFT);
    assert(label(lv_screen_active(), "In Verwendung: Sam"));
    parallelList({1, false, false, {{7, "Robin"}, {12, "Sam"}}});
    assert(label(lv_screen_active(), "Voll"));
    display.capture(output, "parallel-06-list-lowered-limit");
    click("Drucker");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());

    // Limit 1 is unchanged: foreign session, classic wording; the force-stop names the session shown.
    parallelList({1, false, false, {{7, "Robin"}}});
    assert(label(lv_screen_active(), "Fremde Sitzung beenden"));
    assert(!label(lv_screen_active(), "Sitzung von Robin beenden"));
    click("Fremde Sitzung beenden");
    assert(server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["usageId"].as<int>() == 7);
    actionReply("STOP_RESOURCE_USAGE_SESSION", R"("error":"Stop denied")");
    Display::hidePopup();
    parallelList({1, false, false, {{7, "Robin"}}});
    click(LV_SYMBOL_LEFT);
    assert(label(lv_screen_active(), "In Verwendung: Robin"));
    click("Abmelden");
    username = "Alex";
    login();
}
