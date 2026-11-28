#include "workflow.hpp"

// Maintenance requests on the reader: "Report a problem" and the "Is the machine OK?" check before the card holder's
// own session ends. The production API parser, details, screens and action flow run against hand-written payloads.
void ReaderWorkflow::testMaintenance()
{
    if (label(lv_screen_active(), "Abmelden")) click("Abmelden");
    clearStatus();
    struct Scenario {
        bool own = false; const char *otherUser = nullptr; bool manager = false;
        bool canRequest = true; bool ask = true; bool underMaintenance = false; bool introduced = true;
    };
    const auto maintenanceList = [&](const Scenario &scenario) {
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
        r["isHealthy"] = true; r["hasIntroduction"] = scenario.introduced; r["requiresSupervisor"] = false;
        r["isUnderMaintenance"] = scenario.underMaintenance;
        r["canManageResource"] = scenario.manager; r["canEndOtherSessions"] = scenario.manager;
        r["canRequestMaintenance"] = scenario.canRequest; r["askMaintenanceCheckOnEnd"] = scenario.ask;
        r["maxParallelSessions"] = 1;
        const bool running = scenario.own || scenario.otherUser;
        r["canStart"] = !running;
        r["activeSessionCount"] = running ? 1 : 0;
        if (running) {
            auto session = scenario.own ? r["ownUsageSession"].to<JsonObject>() : r["activeUsageSession"].to<JsonObject>();
            session["id"] = 9; session["user"]["username"] = scenario.own ? username.c_str() : scenario.otherUser;
            session["startTime"] = "2026-01-01T10:00:00Z";
            if (scenario.own) r["activeUsageSession"] = session;
            r["activeUsageSessions"].add(session);
        }
        std::string payload; serializeJson(doc, payload); server.push("RESOURCE_LIST", payload);
        pump();
    };
    const auto actionReply = [&](const char *type, const std::string &body) {
        server.push(type, "{\"requestId\":" + std::to_string(requestIdOf(type)) + "," + body + "}");
        pump();
    };
    const char *stop = "STOP_RESOURCE_USAGE_SESSION";
    const auto asking = [] { return lv_screen_active() == Display::maintenanceCheckScreen.getScreen(); };
    const auto enteringReason = [] { return lv_screen_active() == Display::maintenanceReasonScreen.getScreen(); };
    const auto sentReason = [&] {
        const auto request = server.last(stop);
        return std::string(request["data"]["payload"]["maintenanceRequest"]["reason"] | "");
    };

    supervised = false; active = false;
    login(false);
    const Scenario ownSession{true};
    maintenanceList(ownSession);

    // Stopping the own session asks first; nothing is sent, and Cancel keeps the session running.
    const auto stops = server.count(stop);
    click("Stop");
    assert(asking() && server.count(stop) == stops);
    assert(label(lv_screen_active(), "Ist die Maschine in Ordnung?"));
    display.capture(output, "maintenance-01-check");
    click("Abbrechen");
    assert(!asking() && server.count(stop) == stops);
    assert(label(lv_screen_active(), "Stop"));

    // "Machine is OK" stops without a request. A refused stop asks again the next time.
    click("Stop");
    click("Maschine ist in Ordnung");
    assert(server.count(stop) == stops + 1);
    assert(server.last(stop)["data"]["payload"]["maintenanceRequest"].isNull());
    actionReply(stop, R"("error":"MachineBusyError")");
    maintenanceList(ownSession);
    clearStatus();

    // "Needs maintenance" asks for at least three characters.
    if (lv_screen_active() != Display::resourceDetailsScreen.getScreen()) click("Laser");
    click("Sitzung beenden");
    assert(asking());
    click("Wartung nötig");
    assert(enteringReason() && server.count(stop) == stops + 1);
    Display::maintenanceReasonScreen.setText("  ab  ");
    assert(lv_obj_has_state(buttonOf(lv_screen_active(), "Weiter"), LV_STATE_DISABLED));
    Display::maintenanceReasonScreen.confirm();
    assert(server.count(stop) == stops + 1);
    Display::maintenanceReasonScreen.setText("  Säge stumpf  ");
    assert(!lv_obj_has_state(buttonOf(lv_screen_active(), "Weiter"), LV_STATE_DISABLED));
    pump(300); // the button finishes its enable animation
    display.capture(output, "maintenance-02-reason");
    click("Weiter");
    assert(server.count(stop) == stops + 2 && sentReason() == "Säge stumpf");

    // The end forms follow, and the resent stop carries the same answer without asking again.
    const auto formRequest = [&] {
        server.push("RESOURCE_USAGE_FORM_REQUEST", "{\"requestId\":" + std::to_string(requestIdOf(stop)) +
                    R"(,"resourceId":1,"action":"end","forms":[{"id":8,"name":"Check","fieldCount":1}]})");
        pump();
        server.push("RESOURCE_USAGE_FORM_FIELDS", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":9,"name":"Sichtprüfung","type":"text","isRequired":true,"value":"OK"}]})");
        pump();
        assert(lv_screen_active() == Display::formsScreen.getScreen());
    };
    formRequest();
    click("Absenden");
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":true})");
    pump();
    assert(!asking() && server.count(stop) == stops + 3 && sentReason() == "Säge stumpf");
    actionReply(stop, R"("success":true,"durationSeconds":60,"endedOwnSession":true,"maintenanceRequestFiled":true)");
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    assert(label(lv_screen_active(), "Wartungsteam benachrichtigt"));
    display.capture(output, "maintenance-03-summary-filed");
    display.touch = {1, 1, true}; pump(); display.touch.pressed = false; pump();

    // A request the server could not file is said on the summary too.
    login(false);
    maintenanceList(ownSession);
    click("Stop"); click("Wartung nötig");
    Display::maintenanceReasonScreen.setText("Rauch");
    click("Weiter");
    actionReply(stop, R"("success":true,"durationSeconds":60,"endedOwnSession":true,"maintenanceRequestFiled":false)");
    assert(label(lv_screen_active(), "Meldung nicht gesendet. Bitte erneut melden."));
    display.capture(output, "maintenance-04-summary-not-filed");
    display.touch = {1, 1, true}; pump(); display.touch.pressed = false; pump();

    // Cancelling the end forms drops the answer: the next stop asks again and starts empty.
    login(false);
    maintenanceList(ownSession);
    // The unfiled reason comes back, also after Cancel on the question, which never showed it.
    click("Stop"); click("Abbrechen");
    click("Stop"); click("Wartung nötig");
    assert(Display::maintenanceReasonScreen.reason() == "Rauch");
    Display::maintenanceReasonScreen.setText("Lüfter laut");
    click("Weiter");
    formRequest();
    const auto beforeCancel = server.count(stop);
    click("Abbrechen");
    maintenanceList(ownSession);
    clearStatus();
    assert(server.count(stop) == beforeCancel);
    if (lv_screen_active() == Display::resourceDetailsScreen.getScreen()) click(LV_SYMBOL_LEFT);
    click("Stop");
    assert(asking() && server.count(stop) == beforeCancel);
    click("Maschine ist in Ordnung");
    assert(server.count(stop) == beforeCancel + 1);
    assert(server.last(stop)["data"]["payload"]["maintenanceRequest"].isNull());
    actionReply(stop, R"("error":"MachineBusyError")");
    maintenanceList(ownSession);
    clearStatus();
    click("Abmelden");

    // A resource that does not ask stops at once.
    login(false);
    Scenario silent{true}; silent.ask = false;
    maintenanceList(silent);
    const auto beforeSilent = server.count(stop);
    click("Stop");
    assert(!asking() && server.count(stop) == beforeSilent + 1);
    actionReply(stop, R"("error":"MachineBusyError")");
    maintenanceList(silent);
    clearStatus();

    // A setting that changes while the question is open must not swallow the stop.
    maintenanceList(ownSession);
    if (lv_screen_active() != Display::resourceDetailsScreen.getScreen()) click("Laser");
    const auto beforeToggle = server.count(stop);
    click("Sitzung beenden");
    assert(asking());
    maintenanceList(silent);
    click("Maschine ist in Ordnung");
    assert(server.count(stop) == beforeToggle + 1);
    actionReply(stop, R"("error":"MachineBusyError")");
    maintenanceList(ownSession);
    clearStatus();

    // A session that ends elsewhere while the reason is typed leaves nothing to stop; the reader says that the
    // report was not sent.
    if (lv_screen_active() != Display::resourceDetailsScreen.getScreen()) click("Laser");
    const auto beforeGone = server.count(stop);
    click("Sitzung beenden");
    click("Wartung nötig");
    Display::maintenanceReasonScreen.setText("Öl läuft aus");
    maintenanceList(Scenario{});
    click("Weiter");
    assert(server.count(stop) == beforeGone);
    assert(label(lv_screen_active(), "Meldung nicht gesendet"));
    assert(label(lv_screen_active(), "Die Sitzung war schon beendet. Bitte erneut melden."));
    display.capture(output, "maintenance-08-session-gone");
    clearStatus();

    // Force-stopping somebody else's session never asks, whatever the flag says.
    Scenario foreign; foreign.otherUser = "robin"; foreign.manager = true;
    maintenanceList(foreign);
    if (lv_screen_active() != Display::resourceDetailsScreen.getScreen()) click("Laser");
    const auto beforeForeign = server.count(stop);
    click("Fremde Sitzung beenden");
    assert(!asking() && server.count(stop) == beforeForeign + 1);
    assert(server.last(stop)["data"]["payload"]["usageId"].as<int>() == 9);
    assert(server.last(stop)["data"]["payload"]["maintenanceRequest"].isNull());
    actionReply(stop, R"("error":"MachineBusyError")");
    maintenanceList(foreign);
    clearStatus();

    // "Report a problem": also without an introduction and while the machine is under maintenance.
    Scenario blocked; blocked.introduced = false; blocked.underMaintenance = true;
    maintenanceList(blocked);
    if (lv_screen_active() != Display::resourceDetailsScreen.getScreen()) click("Laser");
    auto *report = buttonOf(lv_screen_active(), "Problem melden");
    assert(report && lv_obj_is_visible(report));
    display.capture(output, "maintenance-05-report-button");
    const char *create = "CREATE_MAINTENANCE_REQUEST";
    const auto reports = server.count(create);
    click("Problem melden");
    assert(enteringReason());
    click("Abbrechen");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen() && server.count(create) == reports);

    click("Problem melden");
    assert(Display::maintenanceReasonScreen.reason().empty());
    Display::maintenanceReasonScreen.setText("Notaus klemmt");
    click("Senden");
    assert(server.count(create) == reports + 1);
    const auto reportRequest = server.last(create);
    assert(reportRequest["data"]["payload"]["resourceId"].as<int>() == 1);
    assert(std::string(reportRequest["data"]["payload"]["reason"] | "") == "Notaus klemmt");
    actionReply(create, R"("success":true)");
    maintenanceList(blocked);
    assert(label(lv_screen_active(), "Wartungsteam benachrichtigt"));
    display.capture(output, "maintenance-06-reported");
    clearStatus();
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());

    // A refused report is said on the button, which retries.
    click("Problem melden");
    Display::maintenanceReasonScreen.setText("Notaus klemmt");
    click("Senden");
    actionReply(create, R"("error":"REQUEST_FAILED")");
    maintenanceList(blocked);
    assert(label(lv_screen_active(), warned("Meldung nicht gesendet").c_str()));
    display.capture(output, "maintenance-07-report-failed");

    // The unsent text comes back on the next try. The keyboard's hide key only hides the keyboard; Cancel discards it.
    click("Problem melden");
    assert(enteringReason() && Display::maintenanceReasonScreen.reason() == "Notaus klemmt");
    lv_obj_t *keyboard = nullptr;
    for (uint32_t i = 0; i < lv_obj_get_child_count(lv_screen_active()); ++i)
        if (lv_obj_check_type(lv_obj_get_child(lv_screen_active(), i), &lv_keyboard_class))
            keyboard = lv_obj_get_child(lv_screen_active(), i);
    assert(keyboard);
    lv_obj_send_event(keyboard, LV_EVENT_CANCEL, nullptr);
    pump();
    assert(enteringReason() && lv_obj_has_flag(keyboard, LV_OBJ_FLAG_HIDDEN));
    assert(Display::maintenanceReasonScreen.reason() == "Notaus klemmt" && server.count(create) == reports + 2);
    click("Abbrechen");
    click("Problem melden");
    assert(Display::maintenanceReasonScreen.reason().empty());
    click("Abbrechen");

    // Without the right to request maintenance (a maintainer, or no license) there is no button.
    Scenario maintainer; maintainer.canRequest = false; maintainer.ask = false;
    maintenanceList(maintainer);
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Problem melden")));
    click(LV_SYMBOL_LEFT);
}
