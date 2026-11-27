#include "workflow.hpp"

// ATT-1421: the card holder moves their running session to another project. The production API parser, details,
// project picker, usage form flow and result screens run against hand-written server payloads.
void ReaderWorkflow::testProjectSwitch()
{
    click("Abmelden");
    struct Running {
        bool offered = true;
        uint32_t projectId = 42;
        const char *projectName = "Werkstattprojekt";
    };
    const auto runningList = [&](const Running &running) {
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
        r["isHealthy"] = true; r["hasIntroduction"] = true; r["maxParallelSessions"] = 1;
        r["canStart"] = false; r["activeSessionCount"] = 1;
        auto own = r["ownUsageSession"].to<JsonObject>();
        own["id"] = 9; own["user"]["username"] = username.c_str(); own["startTime"] = "2026-01-01T10:00:00Z";
        r["activeUsageSession"] = own;
        r["activeUsageSessions"].add(own);
        if (running.offered) {
            r["canSwitchProject"] = true;
            r["ownProjectId"] = running.projectId;
            if (running.projectName) r["ownProjectName"] = running.projectName;
            else r["ownProjectName"] = nullptr;
        }
        std::string payload; serializeJson(doc, payload); server.push("RESOURCE_LIST", payload);
        pump();
    };
    const auto projects = [&] {
        const auto request = server.last("PROJECTS_OF_USER");
        server.push("PROJECTS_OF_USER",
                    R"({"page":1,"limit":4,"total":2,"search":"","requestId":)" +
                        std::to_string(request["data"]["payload"]["requestId"].as<uint32_t>()) +
                        R"(,"projects":[{"id":42,"name":"Werkstattprojekt"},{"id":43,"name":"Zweitprojekt"}]})");
        pump();
    };
    const auto reply = [&](const char *body) {
        const auto id = server.last("SWITCH_SESSION_PROJECT")["data"]["payload"]["requestId"].as<uint32_t>();
        server.push("SWITCH_SESSION_PROJECT", "{\"requestId\":" + std::to_string(id) + "," + body + "}");
        pump();
    };
    const auto openPicker = [&] {
        click("Projekt wechseln");
        assert(lv_screen_active() == Display::projectSelectScreen.getScreen());
        projects();
        assert(label(lv_screen_active(), "Kein Projekt"));
    };
    const auto disabled = [](const char *caption) {
        return lv_obj_has_state(buttonOf(lv_screen_active(), caption), LV_STATE_DISABLED);
    };

    supervised = false; active = false;
    login(false);

    // A server that does not offer the switch (an older one): the details show nothing new.
    runningList({false});
    click("Laser");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Projekt wechseln")));

    // The offered switch shows the project the session is booked to.
    runningList({});
    assert(label(lv_screen_active(), "Projekt: Werkstattprojekt"));
    assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Projekt wechseln")));
    display.capture(output, "project-switch-01-details");

    // The picker offers "no project" and refuses the current one; cancelling sends nothing.
    const auto sent = server.count("SWITCH_SESSION_PROJECT");
    openPicker();
    assert(disabled("Werkstattprojekt") && !disabled("Kein Projekt") && !disabled("Zweitprojekt"));
    display.capture(output, "project-switch-02-picker");
    click("Abbrechen");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(server.count("SWITCH_SESSION_PROJECT") == sent);

    // Another project: the request names the running session; the confirmation names the new project.
    openPicker();
    click("Zweitprojekt");
    assert(server.count("SWITCH_SESSION_PROJECT") == sent + 1);
    {
        const auto request = server.last("SWITCH_SESSION_PROJECT");
        const auto payload = request["data"]["payload"];
        assert(payload["resourceId"].as<int>() == 1 && payload["usageId"].as<int>() == 9);
        assert(payload["projectId"].as<int>() == 43);
    }
    reply(R"("success":true,"usageId":10,"projectName":"Zweitprojekt")");
    runningList({true, 43, "Zweitprojekt"});
    assert(label(lv_screen_active(), "Projekt gewechselt") && label(lv_screen_active(), "Zweitprojekt"));
    display.capture(output, "project-switch-03-confirmed");
    clearStatus();
    assert(label(lv_screen_active(), "Projekt: Zweitprojekt"));

    // No project: the request carries an explicit null.
    openPicker();
    click("Kein Projekt");
    assert(server.count("SWITCH_SESSION_PROJECT") == sent + 2);
    {
        const auto request = server.last("SWITCH_SESSION_PROJECT");
        const auto payload = request["data"]["payload"].as<JsonObjectConst>();
        assert(!payload["projectId"].is<int>() && payload["projectId"].isNull());
        std::string text; serializeJson(payload, text);
        assert(text.find("\"projectId\":null") != std::string::npos);
    }
    reply(R"("success":true,"usageId":11,"projectName":null)");
    runningList({true, 0, nullptr});
    assert(label(lv_screen_active(), "Kein Projekt"));
    clearStatus();
    assert(label(lv_screen_active(), "Projekt: Kein Projekt"));
    // Without a project, "no project" is the current choice.
    openPicker();
    assert(disabled("Kein Projekt") && !disabled("Werkstattprojekt"));

    // Required forms: shown with the reader's usage form flow, then the same switch is sent again.
    click("Werkstattprojekt");
    assert(server.count("SWITCH_SESSION_PROJECT") == sent + 3);
    const auto formRequestId = server.last("SWITCH_SESSION_PROJECT")["data"]["payload"]["requestId"].as<uint32_t>();
    server.push("RESOURCE_USAGE_FORM_REQUEST",
                "{\"requestId\":" + std::to_string(formRequestId) +
                    R"(,"resourceId":1,"action":"project-switch","forms":[{"id":8,"name":"Wechselprotokoll","fieldCount":1}]})");
    pump();
    assert(lv_screen_active() == Display::formsScreen.getScreen());
    {
        const auto fields = server.last("RESOURCE_USAGE_FORM_GET_FIELDS");
        assert(std::string(fields["data"]["payload"]["action"].as<const char *>()) == "project-switch");
    }
    server.push("RESOURCE_USAGE_FORM_FIELDS", R"({"resourceId":1,"action":"project-switch","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":9,"name":"Material","type":"text","isRequired":true,"value":"Holz"}]})");
    pump();
    display.capture(output, "project-switch-04-form");
    assert(label(lv_screen_active(), "Bitte vor dem Wechsel ausfüllen"));
    click("Absenden");
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"project-switch","formId":8,"offset":0,"valid":true,"errors":[]})");
    pump();
    assert(server.count("SWITCH_SESSION_PROJECT") == sent + 4);
    {
        const auto request = server.last("SWITCH_SESSION_PROJECT");
        assert(request["data"]["payload"]["projectId"].as<int>() == 42 && request["data"]["payload"]["usageId"].as<int>() == 9);
    }
    reply(R"("success":true,"usageId":12,"projectName":"Werkstattprojekt")");
    runningList({});
    clearStatus();

    // A refused switch says why on the button; the session keeps its project.
    openPicker();
    click("Zweitprojekt");
    reply(R"("error":"METER_SWITCH_FAILED")");
    runningList({});
    pump();
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(label(lv_screen_active(), warned("Zähler nicht lesbar. Projekt unverändert.").c_str()));
    assert(label(lv_screen_active(), "Projekt: Werkstattprojekt"));
    display.capture(output, "project-switch-05-refused");
    pump(4500);

    // A resource that charges a switch like a new session can refuse it for the balance.
    openPicker();
    click("Zweitprojekt");
    reply(R"("error":"INSUFFICIENT_BALANCE","sumUpEnabled":false)");
    runningList({});
    assert(label(lv_screen_active(), "Unzureichendes Guthaben"));
    clearStatus();
    assert(label(lv_screen_active(), "Projekt: Werkstattprojekt"));

    // The choice before a start is unchanged: no "no project" entry of the switch.
    click(LV_SYMBOL_LEFT);
}
