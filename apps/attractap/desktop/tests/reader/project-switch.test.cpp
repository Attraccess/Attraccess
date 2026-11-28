#include "workflow.hpp"

// ATT-1421: the card holder moves their running session to another project. The production API parser, details,
// project picker, usage form flow and result screens run against hand-written server payloads.
void ReaderWorkflow::testProjectSwitch()
{
    // The handshake (api/handlers/auth.cpp) announces that this touch build offers the switch; without it the
    // server refuses SWITCH_SESSION_PROJECT.
    assert(server.last("READER_FIRMWARE_INFO")["data"]["payload"]["capabilities"]["projectSwitch"] == true);
    click("Abmelden");
    struct Running {
        bool offered = true;
        uint32_t projectId = 42;
        const char *projectName = "Werkstattprojekt";
        uint32_t usageId = 9;
        bool timed = false; // an automatic end adds "Extend" above the project
        bool running = true; // false: the session has ended
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
        r["canStart"] = !running.running; r["activeSessionCount"] = running.running ? 1 : 0;
        const auto push = [&] {
            std::string payload; serializeJson(doc, payload); server.push("RESOURCE_LIST", payload);
            pump();
        };
        if (!running.running) return push();
        auto own = r["ownUsageSession"].to<JsonObject>();
        own["id"] = running.usageId; own["user"]["username"] = username.c_str(); own["startTime"] = "2026-01-01T10:00:00Z";
        if (running.timed) {
            own["autoEndAt"] = "2026-01-01T11:00:00Z"; own["autoEndUtcOffsetMinutes"] = 60;
            own["autoEndInSeconds"] = 3579; own["extendLimitInSeconds"] = 10779; own["hasMaxSessionTime"] = true;
        }
        r["activeUsageSession"] = own;
        r["activeUsageSessions"].add(own);
        if (running.offered) {
            r["canSwitchProject"] = true;
            r["ownProjectId"] = running.projectId;
            if (running.projectName) r["ownProjectName"] = running.projectName;
            else r["ownProjectName"] = nullptr;
        }
        push();
    };
    const auto ended = [] { Running row; row.running = false; return row; }();
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


    // A full page: "No project" and all projects of the page are visible without scrolling.
    const auto pageReply = [&](unsigned page, const char *search, unsigned total, const std::vector<std::string> &names) {
        const auto request = server.last("PROJECTS_OF_USER");
        std::string items;
        for (size_t i = 0; i < names.size(); ++i)
            items += std::string(i ? "," : "") + "{\"id\":" + std::to_string(50 + 10 * page + i) + ",\"name\":\"" + names[i] + "\"}";
        server.push("PROJECTS_OF_USER",
                    "{\"page\":" + std::to_string(page) + ",\"limit\":4,\"total\":" + std::to_string(total) +
                        ",\"search\":\"" + search + "\",\"hasMore\":" + (page * 4 < total ? "true" : "false") +
                        ",\"requestId\":" + std::to_string(request["data"]["payload"]["requestId"].as<uint32_t>()) +
                        ",\"projects\":[" + items + "]}");
        pump();
    };
    // Types into the picker's search field (it shows its placeholder or the active query) and confirms.
    const auto searchFor = [&](const char *fieldCaption, const char *query) {
        click(fieldCaption);
        std::function<lv_obj_t *(lv_obj_t *)> keyboardIn = [&](lv_obj_t *root) -> lv_obj_t * {
            if (lv_obj_has_flag(root, LV_OBJ_FLAG_HIDDEN)) return nullptr;
            if (lv_obj_check_type(root, &lv_keyboard_class)) return root;
            for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
                if (auto *found = keyboardIn(lv_obj_get_child(root, i))) return found;
            return nullptr;
        };
        lv_obj_t *keyboard = keyboardIn(lv_screen_active());
        assert(keyboard);
        lv_textarea_set_text(lv_keyboard_get_textarea(keyboard), query);
        lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
        pump();
    };
    const auto fullyVisible = [](const char *caption) {
        lv_obj_t *button = buttonOf(lv_screen_active(), caption);
        if (!button || !lv_obj_is_visible(button)) return false;
        const lv_area_t area = areaOf(button);
        for (auto *parent = lv_obj_get_parent(button); parent; parent = lv_obj_get_parent(parent))
            if (!LayoutCheck::inside(area, areaOf(parent))) return false;
        return true;
    };
    const std::vector<std::string> fullPage = {
        "Alpha", "Beta", "Ein Projekt mit einem sehr langen Namen, der nicht in eine Zeile passt", "Delta"};
    runningList({});
    click("Projekt wechseln");
    pageReply(1, "", 5, fullPage);
    assert(fullyVisible("Kein Projekt"));
    assert(fullyVisible("Alpha") && fullyVisible("Beta") && fullyVisible("Delta"));
    {
        // The list holds exactly the page, as before a start: nothing is left to scroll to.
        lv_obj_t *list = lv_obj_get_parent(buttonOf(lv_screen_active(), "Delta"));
        lv_obj_update_layout(list);
        assert(lv_obj_get_child_count(list) == fullPage.size() && lv_obj_get_scroll_bottom(list) <= 0);
    }
    display.capture(output, "project-switch-06-full-page");

    // "No project" is not an entry of one page: it stays on later pages and in search results.
    click("Weiter");
    pageReply(2, "", 5, {"Epsilon"});
    assert(fullyVisible("Kein Projekt") && fullyVisible("Epsilon"));

    // Reopening starts on the first page of all projects, whatever was viewed last.
    const auto reopen = [&] {
        click("Abbrechen");
        const auto requests = server.count("PROJECTS_OF_USER");
        click("Projekt wechseln");
        assert(server.count("PROJECTS_OF_USER") == requests + 1);
        const auto request = server.last("PROJECTS_OF_USER");
        assert(request["data"]["payload"]["page"].as<int>() == 1 && request["data"]["payload"]["search"].isNull());
        assert(!label(lv_screen_active(), "Epsilon"));
        pageReply(1, "", 5, fullPage);
    };
    reopen();
    assert(label(lv_screen_active(), "Seite 1 von 2") && fullyVisible("Alpha"));
    // The same for a search.
    searchFor("Projekte suchen", "eps");
    pageReply(1, "eps", 1, {"Epsilon"});
    assert(fullyVisible("Kein Projekt") && fullyVisible("Epsilon"));
    reopen();
    assert(label(lv_screen_active(), "Projekte suchen") && fullyVisible("Alpha"));
    click("Abbrechen");

    // A long project name ends in dots on one line, so a timed session still shows "End session" completely.
    const char *longName = "Ein Projekt mit einem sehr langen Namen für schmale Bildschirme ÄÖÜ";
    runningList({true, 42, longName, 9, true});
    {
        std::function<lv_obj_t *(lv_obj_t *)> projectLine = [&](lv_obj_t *root) -> lv_obj_t * {
            if (lv_obj_check_type(root, &lv_label_class) && std::string(lv_label_get_text(root)).rfind("Projekt: ", 0) == 0)
                return root;
            for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
                if (auto *found = projectLine(lv_obj_get_child(root, i))) return found;
            return nullptr;
        };
        lv_obj_t *line = projectLine(lv_screen_active());
        assert(line);
        lv_obj_update_layout(line);
        const auto *font = lv_obj_get_style_text_font(line, LV_PART_MAIN);
        assert(lv_obj_get_height(line) == lv_font_get_line_height(font));
        const std::string shownText = lv_label_get_text(line);
        assert(shownText.size() > 3 && shownText.compare(shownText.size() - 3, 3, "...") == 0);
    }
    assert(fullyVisible("Sitzung beenden"));
    display.capture(output, "project-switch-07-long-name");
    // A short name after a long one is shown in full again.
    runningList({true, 43, "Zweitprojekt", 9, true});
    assert(label(lv_screen_active(), "Projekt: Zweitprojekt"));

    // The picker closes when its session is no longer offered for a switch, or is another one (it ended, or was
    // switched elsewhere). A refresh that changes neither leaves it open.
    const auto onDetails = [] { return lv_screen_active() == Display::resourceDetailsScreen.getScreen(); };
    const auto switchesBefore = server.count("SWITCH_SESSION_PROJECT");
    runningList({});
    openPicker();
    runningList({});
    assert(lv_screen_active() == Display::projectSelectScreen.getScreen());
    runningList({false});
    assert(onDetails());
    runningList({});
    openPicker();
    runningList({true, 43, "Zweitprojekt", 20});
    assert(onDetails() && label(lv_screen_active(), "Projekt: Zweitprojekt"));
    assert(server.count("SWITCH_SESSION_PROJECT") == switchesBefore);

    // So do the usage forms of a switch: the draft is cancelled and the switch is not sent again.
    runningList({});
    openPicker();
    click("Zweitprojekt");
    server.push("RESOURCE_USAGE_FORM_REQUEST",
                "{\"requestId\":" + std::to_string(requestIdOf("SWITCH_SESSION_PROJECT")) +
                    R"(,"resourceId":1,"action":"project-switch","forms":[{"id":8,"name":"Wechselprotokoll","fieldCount":1}]})");
    pump();
    assert(lv_screen_active() == Display::formsScreen.getScreen());
    runningList({});
    assert(lv_screen_active() == Display::formsScreen.getScreen());
    const auto cancels = server.count("RESOURCE_USAGE_FORM_CANCEL");
    runningList({true, 43, "Zweitprojekt", 21});
    assert(onDetails());
    assert(server.count("RESOURCE_USAGE_FORM_CANCEL") == cancels + 1);
    {
        const auto cancel = server.last("RESOURCE_USAGE_FORM_CANCEL");
        assert(std::string(cancel["data"]["payload"]["action"].as<const char *>()) == "project-switch");
    }
    assert(server.count("SWITCH_SESSION_PROJECT") == switchesBefore + 1);
    // The row requested after the cancel unblocks the details.
    runningList({true, 43, "Zweitprojekt", 21});
    assert(label(lv_screen_active(), "Projekt: Zweitprojekt"));

    // A switch already sent is left alone: the refreshed row may arrive before its answer.
    openPicker();
    click("Werkstattprojekt");
    runningList({true, 42, "Werkstattprojekt", 22});
    reply(R"("success":true,"usageId":22,"projectName":"Werkstattprojekt")");
    runningList({true, 42, "Werkstattprojekt", 22});
    assert(label(lv_screen_active(), "Projekt gewechselt") && label(lv_screen_active(), "Werkstattprojekt"));
    clearStatus();
    assert(label(lv_screen_active(), "Projekt: Werkstattprojekt"));

    // The session ended just as the choice was made: the refusal has no button left to appear on and says why on a
    // screen of its own, whether the refreshed row arrives after the answer or before it.
    for (const bool rowFirst : {false, true}) {
        runningList({});
        openPicker();
        click("Zweitprojekt");
        if (rowFirst) runningList(ended);
        reply(R"("error":"NoOwnActiveSessionError")");
        runningList(ended);
        assert(lv_screen_active() == Display::statusScreen.getScreen());
        assert(label(lv_screen_active(), "Projekt nicht gewechselt"));
        assert(label(lv_screen_active(), "Ihre Sitzung läuft nicht mehr."));
        // Not the text of a stop without an own session: nothing was to be ended here.
        assert(!label(lv_screen_active(), "Sie haben hier keine eigene Sitzung. Es wurde nichts beendet."));
        assert(!label(lv_screen_active(), "Code: NoOwnActiveSessionError"));
        display.capture(output, "project-switch-08-session-ended");
        clearStatus();
        assert(onDetails() && !lv_obj_is_visible(requireLabel(lv_screen_active(), "Projekt wechseln")));
    }
    // Another refusal whose button goes before it could be read moves to the full-screen error, in both orders.
    for (const bool rowFirst : {false, true}) {
        runningList({});
        openPicker();
        click("Zweitprojekt");
        if (rowFirst) runningList(ended);
        reply(R"("error":"METER_SWITCH_FAILED")");
        runningList(ended);
        assert(lv_screen_active() == Display::statusScreen.getScreen());
        assert(label(lv_screen_active(), "Zähler nicht lesbar. Projekt unverändert."));
        assert(label(lv_screen_active(), "Code: METER_SWITCH_FAILED"));
        click("Zurück");
        assert(onDetails());
    }
    // Refusals the reader has no text of its own for show the general failure on the button, and the session keeps
    // running: a switch made elsewhere continued the named record (the row now names the continuation), or a
    // project-switch flow failed.
    for (const auto &[code, rowAfter] : {std::pair{"PROJECT_SWITCH_SESSION_CHANGED", Running{true, 43, "Zweitprojekt", 30}},
                                         std::pair{"FLOW_EXECUTION_ERROR", Running{}}}) {
        runningList({});
        openPicker();
        click("Zweitprojekt");
        reply((std::string(R"("error":")") + code + R"(")").c_str());
        runningList(rowAfter);
        assert(onDetails());
        assert(label(lv_screen_active(), warned("Fehlgeschlagen – erneut tippen").c_str()));
        assert(label(lv_screen_active(), (std::string("Projekt: ") + rowAfter.projectName).c_str()));
        pump(4500);
        assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Projekt wechseln")));
    }
    // Once the refreshed row kept the button, the reason was readable there: a later end just takes both away.
    runningList({});
    openPicker();
    click("Zweitprojekt");
    reply(R"("error":"METER_SWITCH_FAILED")");
    runningList({});
    assert(label(lv_screen_active(), warned("Zähler nicht lesbar. Projekt unverändert.").c_str()));
    runningList(ended);
    assert(onDetails() && !label(lv_screen_active(), warned("Zähler nicht lesbar. Projekt unverändert.").c_str()));

    // The choice before a start does not take over what the switch picker was searching for.
    runningList({});
    openPicker();
    searchFor("Projekte suchen", "eps");
    pageReply(1, "eps", 1, {"Epsilon"});
    runningList(ended);
    assert(onDetails());
    {
        const auto requests = server.count("PROJECTS_OF_USER");
        click("Projekt wählen");
        assert(server.count("PROJECTS_OF_USER") == requests + 1);
        const auto request = server.last("PROJECTS_OF_USER");
        assert(request["data"]["payload"]["page"].as<int>() == 1 && request["data"]["payload"]["search"].isNull());
        assert(label(lv_screen_active(), "Projekte suchen") && !label(lv_screen_active(), "Epsilon"));
        // The choice before a start is unchanged: no "no project" entry of the switch.
        assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Kein Projekt")));
    }
    // Its own search it keeps, as before.
    pageReply(1, "", 5, fullPage);
    searchFor("Projekte suchen", "alp");
    pageReply(1, "alp", 1, {"Alpha"});
    click("Abbrechen");
    {
        const auto requests = server.count("PROJECTS_OF_USER");
        click("Projekt wählen");
        assert(server.count("PROJECTS_OF_USER") == requests);
        assert(label(lv_screen_active(), "alp") && label(lv_screen_active(), "Alpha"));
    }
    click("Abbrechen");
    click(LV_SYMBOL_LEFT);
}
