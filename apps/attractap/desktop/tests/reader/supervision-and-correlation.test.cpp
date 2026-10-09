#include "workflow.hpp"

void ReaderWorkflow::testSupervisionAndCorrelation()
{
    click("CNC Fräse");
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    display.capture(output, "08-resource-first-scan");
    login();
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(label(lv_screen_active(), "CNC Fräse"));
    display.capture(output, "09-restricted-details");
    click(LV_SYMBOL_LEFT);
    click("Öffnen");
    assert(server.last("UNLOCK_DOOR")["data"]["payload"]["resourceId"].as<int>() == 3);
    server.push("UNLOCK_DOOR", R"({"error":"Denied by test"})"); pump(); list();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_layer_top(), "Denied by test"));
    display.capture(output, "10-action-error");
    Display::hidePopup();
    active = false; supervised = true; list(); click("Aufsicht");
    assert(lv_screen_active() == Display::supervisionScreen.getScreen());
    assert(server.last("SUPERVISION_REQUEST")["data"]["payload"]["resourceId"].as<int>() == 1);
    display.capture(output, "11-supervisor-request");
    pump(1100); click("Abbrechen"); list();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Alex"));
    supervised = false; list();
    const uint32_t oldRequestId = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
    click("Start");
    const uint32_t currentRequestId = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
    assert(oldRequestId != currentRequestId);
    assert(server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["projectId"].isNull());
    const auto refreshesBefore = server.count("REQUEST_RESOURCE_LIST");
    server.push("START_RESOURCE_USAGE_SESSION", "{\"success\":true,\"requestId\":" + std::to_string(oldRequestId) + "}");
    server.push("START_RESOURCE_USAGE_SESSION", "{\"error\":\"Stale failure\",\"requestId\":" + std::to_string(oldRequestId) + "}");
    server.push("RESOURCE_USAGE_FORM_REQUEST", "{\"resourceId\":1,\"action\":\"start\",\"requestId\":" + std::to_string(oldRequestId) + ",\"forms\":[{\"id\":8,\"fieldCount\":1}]}");
    pump();
    assert(server.count("REQUEST_RESOURCE_LIST") == refreshesBefore);
    assert(!label(lv_layer_top(), "Stale failure"));
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Starte Sitzung"));
    server.push("START_RESOURCE_USAGE_SESSION", "{\"success\":true,\"requestId\":" + std::to_string(currentRequestId) + "}");
    pump(); active = true; list();
    // A delayed pre-action snapshot cannot overwrite the completed usage.
    server.push("RESOURCE_LIST", R"({"revision":1,"authenticatedUsername":"Alex","resources":[]})"); pump();
    assert(label(lv_screen_active(), "Stop"));
    // A newer broadcast can overtake the matching refresh without trapping input.
    click("Stop"); server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true,"billingSummary":{"amount":0,"total":"0,00 EUR"}})"); pump();
    assert(!label(lv_layer_top(), "Gesamtkosten dieser Sitzung"));
    active = false; list(true, false, false);
    const auto refreshId = server.last("REQUEST_RESOURCE_LIST")["data"]["payload"]["requestId"].as<uint32_t>();
    server.push("RESOURCE_LIST", "{\"revision\":" + std::to_string(listVersion - 1) + ",\"requestId\":" + std::to_string(refreshId) + ",\"resources\":[]}"); pump();
    assert(label(lv_screen_active(), "Start"));
    assert(!lv_obj_is_visible(label(lv_screen_active(), "Status wird geladen")));
    active = true; list();
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); list(false); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(!lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
    display.capture(output, "12-reconnected-signed-out");
}
