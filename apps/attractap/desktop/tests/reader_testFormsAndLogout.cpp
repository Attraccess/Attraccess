#include "reader_workflow.hpp"

void ReaderWorkflow::testFormsAndLogout()
{
    click(LV_SYMBOL_LEFT);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Alex"));
    // Going back must keep the fetched project catalogue.
    click("Lasercutter"); click("Projekt wählen");
    assert(label(lv_layer_top(), "Werkstattprojekt"));
    click("Werkstattprojekt", true); click(LV_SYMBOL_LEFT);
    click("Stop");
    assert(server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["resourceId"].as<int>() == 1);
    server.push("RESOURCE_USAGE_FORM_REQUEST", R"({"resourceId":1,"action":"end","forms":[{"id":8,"name":"Check","fieldCount":1}]})");
    pump();
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(server.count("RESOURCE_USAGE_FORM_GET_FIELDS") > 0);
    display.capture(output, "06-required-end-form");
    server.push("RESOURCE_USAGE_FORM_FIELDS", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":9,"name":"Sichtprüfung","type":"text","isRequired":true,"value":"OK"}]})");
    pump();
    display.capture(output, "06b-required-form-ready");
    click(LV_SYMBOL_CLOSE, true);
    assert(server.count("RESOURCE_USAGE_FORM_CANCEL") > 0);
    list();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Stop"));
    // Complete the required end form, then wait for the resumed stop result.
    const auto stopsBeforeForm = server.count("STOP_RESOURCE_USAGE_SESSION");
    click("Stop");
    server.push("RESOURCE_USAGE_FORM_REQUEST", R"({"resourceId":1,"action":"end","forms":[{"id":8,"name":"Check","fieldCount":1}]})"); pump();
    server.push("RESOURCE_USAGE_FORM_FIELDS", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":9,"name":"Sichtprüfung","type":"text","isRequired":true,"value":"OK"}]})"); pump();
    click("Absenden", true);
    assert(server.count("RESOURCE_USAGE_FORM_SUBMIT_PAGE") == 1);
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":true})"); pump();
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeForm + 2);
    server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true,"billingSummary":{"amount":1250,"total":"12,50 EUR"}})"); pump();
    assert(label(lv_layer_top(), "Gesamtkosten dieser Sitzung"));
    assert(label(lv_layer_top(), "12,50 EUR"));
    active = false; list();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Start"));
    display.capture(output, "06c-form-completed-stop");
    display.capture(output, "06d-session-billing-summary");
    click("OK", true);
    assert(!label(lv_layer_top(), "12,50 EUR"));
    // A separately running usage is unaffected by reader logout.
    active = true; list();
    const auto stopsBeforeLogout = server.count("STOP_RESOURCE_USAGE_SESSION");
    click("Abmelden");
    assert(!label(lv_screen_active(), "Alex") || !lv_obj_is_visible(label(lv_screen_active(), "Alex")));
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeLogout);
    display.capture(output, "07-logout-usage-preserved");
}
