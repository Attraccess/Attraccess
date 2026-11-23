#include "workflow.hpp"

// ATT-43: the duration input before a start, a takeover and a supervised start on a machine that requires an
// estimate, and the extension of a running session by its owner or by a manager. The production API parser, list, details and action flow run against
// hand-written RESOURCE_LIST payloads.
void ReaderWorkflow::testSessionDuration()
{
    click("Abmelden");
    struct Scenario {
        bool requireEstimate; int maxMinutes; bool own;
        int autoEndInSeconds = 3600; int limitSeconds = 3600 + 7200; bool hasMax = true; bool withDeadline = true;
        // Another person's running session (not `own`), and what the card holder may do about it.
        const char *otherUser = nullptr; bool allowTakeOver = false; bool manager = false; bool supervised = false;
    };
    const auto durationList = [&](const Scenario &scenario) {
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
        r["id"] = 1; r["name"] = "Laser"; r["description"] = ""; r["type"] = "machine";
        r["isHealthy"] = true; r["hasIntroduction"] = !scenario.supervised; r["requiresSupervisor"] = scenario.supervised;
        r["allowTakeOver"] = scenario.allowTakeOver;
        r["canManageResource"] = scenario.manager; r["canEndOtherSessions"] = scenario.manager;
        r["maxParallelSessions"] = 1;
        r["requireSessionDurationEstimate"] = scenario.requireEstimate;
        if (scenario.maxMinutes > 0) r["maxSessionDurationMinutes"] = scenario.maxMinutes;
        const bool running = scenario.own || scenario.otherUser;
        r["canStart"] = !running;
        r["activeSessionCount"] = running ? 1 : 0;
        if (running) {
            auto own = scenario.own ? r["ownUsageSession"].to<JsonObject>() : r["activeUsageSession"].to<JsonObject>();
            own["id"] = 9; own["user"]["username"] = scenario.own ? username.c_str() : scenario.otherUser;
            own["startTime"] = "2026-01-01T10:00:00Z";
            if (scenario.withDeadline) {
                own["autoEndAt"] = "2026-01-01T11:00:00Z";
                own["autoEndUtcOffsetMinutes"] = 60;
                own["autoEndInSeconds"] = scenario.autoEndInSeconds;
                own["hasMaxSessionTime"] = scenario.hasMax;
                own["extendLimitInSeconds"] = scenario.limitSeconds;
            }
            if (scenario.own) r["activeUsageSession"] = own;
            r["activeUsageSessions"].add(own);
        }
        std::string payload; serializeJson(doc, payload); server.push("RESOURCE_LIST", payload);
        pump();
    };
    const auto actionReply = [&](const char *type, const char *body) {
        const auto id = server.last(type)["data"]["payload"]["requestId"].as<uint32_t>();
        server.push(type, "{\"requestId\":" + std::to_string(id) + "," + body + "}");
        pump();
    };

    supervised = false; active = false;
    login(false);

    // A machine that requires an estimate asks first; nothing is sent until the user chose.
    durationList({true, 120, false});
    const auto starts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Start");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts);
    assert(lv_screen_active() == Display::durationInputScreen.getScreen());
    assert(label(lv_screen_active(), "Wie lange nutzen Sie die Maschine?"));
    assert(label(lv_screen_active(), "Maximale Sitzungsdauer: 2 h"));
    display.capture(output, "duration-01-input");

    // Cancel aborts the start and returns to the list.
    click("Abbrechen");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts);
    assert(lv_screen_active() != Display::durationInputScreen.getScreen());
    assert(label(lv_screen_active(), "Laser"));

    // The chosen estimate travels with the start request.
    click("Start");
    assert(lv_screen_active() == Display::durationInputScreen.getScreen());
    click("2 h");
    click("Start");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    const auto startRequest = server.last("START_RESOURCE_USAGE_SESSION");
    const auto start = startRequest["data"]["payload"];
    assert(start["resourceId"].as<int>() == 1 && start["estimatedDurationMinutes"].as<int>() == 120);
    // The server refuses a value above the maximum: nothing was started, the reader says so.
    actionReply("START_RESOURCE_USAGE_SESSION", R"("error":"SESSION_DURATION_ESTIMATE_EXCEEDS_MAXIMUM")");
    pump();
    clearStatus();

    // A machine that requires none starts as before, without an estimate.
    durationList({false, 0, false});
    const auto plainStarts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Start");
    assert(lv_screen_active() != Display::durationInputScreen.getScreen());
    assert(server.count("START_RESOURCE_USAGE_SESSION") == plainStarts + 1);
    const auto plainRequest = server.last("START_RESOURCE_USAGE_SESSION");
    assert(plainRequest["data"]["payload"]["estimatedDurationMinutes"].isNull());
    actionReply("START_RESOURCE_USAGE_SESSION", R"("error":"ResourceFullError")");
    clearStatus();

    // The own running session: remaining time, stop time and Extend on the details.
    durationList({true, 480, true});
    click("Laser");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(label(lv_screen_active(), "Sitzung beenden"));
    assert(label(lv_screen_active(), "Stoppt automatisch in 1:00:00 (um 12:00)"));
    display.capture(output, "duration-02-details-running");
    const auto extends = server.count("EXTEND_RESOURCE_USAGE_SESSION");
    click("Verlängern");
    assert(lv_screen_active() == Display::extendSessionScreen.getScreen());
    assert(label(lv_screen_active(), "Auf Maximum verlängern"));
    display.capture(output, "duration-03-extend");
    click("+1 h");
    assert(server.count("EXTEND_RESOURCE_USAGE_SESSION") == extends + 1);
    const auto extendRequest = server.last("EXTEND_RESOURCE_USAGE_SESSION");
    const auto extend = extendRequest["data"]["payload"];
    assert(extend["resourceId"].as<int>() == 1 && extend["extendByMinutes"].as<int>() == 60 && extend["toMax"].isNull());
    // Extended: the refreshed list carries the new deadline (2 h left, 1 h of room below the maximum).
    actionReply("EXTEND_RESOURCE_USAGE_SESSION", R"("success":true,"usageId":9)");
    durationList({true, 480, true, 7200, 7200 + 3600});
    clearStatus(); // "Aktion bestätigt"
    assert(label(lv_screen_active(), "Stoppt automatisch in 2:00:00 (um 12:00)"));

    // The server refuses an extension past the maximum: the reader says so and keeps the session.
    click("Verlängern");
    assert(lv_screen_active() == Display::extendSessionScreen.getScreen());
    click("Auf Maximum verlängern");
    const auto toMaxRequest = server.last("EXTEND_RESOURCE_USAGE_SESSION");
    assert(toMaxRequest["data"]["payload"]["toMax"].as<bool>());
    actionReply("EXTEND_RESOURCE_USAGE_SESSION", R"("error":"SESSION_EXTENSION_EXCEEDS_MAXIMUM")");
    pump();
    assert(label(lv_screen_active(), "Das überschreitet die maximale Sitzungsdauer"));
    display.capture(output, "duration-04-extend-refused");
    click("Zurück");

    // A session without a deadline (an older server, or no limit): no countdown and no Extend.
    durationList({false, 0, true, 0, 0, false, false});
    if (lv_screen_active() != Display::resourceDetailsScreen.getScreen()) click("Laser");
    assert(label(lv_screen_active(), "Sitzung beenden"));
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Verlängern")));

    // Supervised start: the estimate is chosen first and also travels with the supervision request, so a supervisor
    // who approves on the web starts the session with it.
    click(LV_SYMBOL_LEFT);
    Scenario supervisedStart{true, 120, false};
    supervisedStart.supervised = true;
    durationList(supervisedStart);
    const auto supervisionRequests = server.count("SUPERVISION_REQUEST");
    click("Aufsicht");
    assert(lv_screen_active() == Display::durationInputScreen.getScreen());
    assert(server.count("SUPERVISION_REQUEST") == supervisionRequests);
    click("1 h");
    click("Start");
    assert(lv_screen_active() == Display::supervisionScreen.getScreen());
    assert(server.count("SUPERVISION_REQUEST") == supervisionRequests + 1);
    const auto supervisionRequest = server.last("SUPERVISION_REQUEST");
    const auto supervision = supervisionRequest["data"]["payload"];
    assert(supervision["resourceId"].as<int>() == 1 && supervision["estimatedDurationMinutes"].as<int>() == 60);
    pump(1100);
    click("Abbrechen");

    // Takeover on a machine that requires an estimate: the taker gives one, and it travels with the forced start.
    // A card holder who may not end the other person's session is offered no Extend for it.
    Scenario takeover{true, 120, false};
    takeover.otherUser = "robin"; takeover.allowTakeOver = true;
    durationList(takeover);
    if (lv_screen_active() != Display::resourceDetailsScreen.getScreen()) click("Übernehmen");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Verlängern")));
    const auto takeoverStarts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Übernehmen");
    assert(lv_screen_active() == Display::durationInputScreen.getScreen());
    assert(server.count("START_RESOURCE_USAGE_SESSION") == takeoverStarts);
    click("2 h");
    click("Start");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == takeoverStarts + 1);
    const auto takeoverRequest = server.last("START_RESOURCE_USAGE_SESSION");
    const auto forced = takeoverRequest["data"]["payload"];
    assert(forced["forceTakeOver"].as<bool>() && forced["estimatedDurationMinutes"].as<int>() == 120);
    actionReply("START_RESOURCE_USAGE_SESSION", R"("error":"ResourceFullError")");
    clearStatus();

    // A manager who may end the other person's session may extend it too; the request names that session.
    Scenario managed{true, 480, false};
    managed.otherUser = "robin"; managed.manager = true;
    durationList(managed);
    if (lv_screen_active() != Display::resourceDetailsScreen.getScreen()) click("Laser");
    assert(label(lv_screen_active(), "Fremde Sitzung beenden"));
    assert(label(lv_screen_active(), "Stoppt automatisch in 1:00:00 (um 12:00)"));
    display.capture(output, "duration-05-manager-details");
    const auto managerExtends = server.count("EXTEND_RESOURCE_USAGE_SESSION");
    click("Verlängern");
    assert(lv_screen_active() == Display::extendSessionScreen.getScreen());
    assert(label(lv_screen_active(), "robin"));
    display.capture(output, "duration-06-manager-extend");
    click("+1 h");
    assert(server.count("EXTEND_RESOURCE_USAGE_SESSION") == managerExtends + 1);
    const auto managerRequest = server.last("EXTEND_RESOURCE_USAGE_SESSION");
    const auto managerExtend = managerRequest["data"]["payload"];
    assert(managerExtend["usageId"].as<int>() == 9 && managerExtend["extendByMinutes"].as<int>() == 60);
    actionReply("EXTEND_RESOURCE_USAGE_SESSION", R"("success":true,"usageId":9)");
    durationList(managed);
    clearStatus(); // "Aktion bestätigt"
}
