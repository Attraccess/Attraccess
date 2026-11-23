#include "workflow.hpp"

// ATT-43: the duration input before a start on a machine that requires an estimate, and the extension of the
// card holder's own running session. The production API parser, list, details and action flow run against
// hand-written RESOURCE_LIST payloads.
void ReaderWorkflow::testSessionDuration()
{
    click("Abmelden");
    struct Scenario {
        bool requireEstimate; int maxMinutes; bool own;
        int autoEndInSeconds = 3600; int limitSeconds = 3600 + 7200; bool hasMax = true; bool withDeadline = true;
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
        r["isHealthy"] = true; r["hasIntroduction"] = true; r["requiresSupervisor"] = false; r["allowTakeOver"] = false;
        r["maxParallelSessions"] = 1;
        r["requireSessionDurationEstimate"] = scenario.requireEstimate;
        if (scenario.maxMinutes > 0) r["maxSessionDurationMinutes"] = scenario.maxMinutes;
        r["canStart"] = !scenario.own;
        r["activeSessionCount"] = scenario.own ? 1 : 0;
        if (scenario.own) {
            auto own = r["ownUsageSession"].to<JsonObject>();
            own["id"] = 9; own["user"]["username"] = username; own["startTime"] = "2026-01-01T10:00:00Z";
            if (scenario.withDeadline) {
                own["autoEndAt"] = "2026-01-01T11:00:00Z";
                own["autoEndUtcOffsetMinutes"] = 60;
                own["autoEndInSeconds"] = scenario.autoEndInSeconds;
                own["hasMaxSessionTime"] = scenario.hasMax;
                own["extendLimitInSeconds"] = scenario.limitSeconds;
            }
            r["activeUsageSession"] = own;
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
    assert(label(lv_screen_active(), "Wie lange nutzt du die Maschine?"));
    assert(label(lv_screen_active(), "Höchstens 2 h"));
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
    assert(label(lv_screen_active(), "Bis zum Maximum"));
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
    click("Bis zum Maximum");
    const auto toMaxRequest = server.last("EXTEND_RESOURCE_USAGE_SESSION");
    assert(toMaxRequest["data"]["payload"]["toMax"].as<bool>());
    actionReply("EXTEND_RESOURCE_USAGE_SESSION", R"("error":"SESSION_EXTENSION_EXCEEDS_MAXIMUM")");
    pump();
    assert(label(lv_screen_active(), "Das überschreitet die Höchstdauer"));
    display.capture(output, "duration-04-extend-refused");
    click("Zurück");

    // A session without a deadline (an older server, or no limit): no countdown and no Extend.
    durationList({false, 0, true, 0, 0, false, false});
    if (lv_screen_active() != Display::resourceDetailsScreen.getScreen()) click("Laser");
    assert(label(lv_screen_active(), "Sitzung beenden"));
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Verlängern")));
}
