#include "workflow.hpp"

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
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":false,"errors":[{"fieldId":9,"code":"REQUIRED_FIELD","message":"Server diagnostic %s"}]})"); pump();
    auto *serverError = requireLabel(lv_layer_top(), "Pflichtfeld");
    assert(!label(lv_layer_top(), "Server diagnostic %s"));
    State::setUserLanguage(true, "en"); pump();
    assert(label(lv_layer_top(), "Required field") == serverError);
    assert(label(lv_layer_top(), "Sichtprüfung *") && label(lv_layer_top(), "OK"));
    display.capture(output, "form-server-error-english");
    State::setUserLanguage(true, "de"); pump();
    assert(label(lv_layer_top(), "Pflichtfeld") == serverError);
    display.capture(output, "form-server-error-german");
    // Known unknown-field validation errors still use the localized catalog.
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":false,"errors":[{"fieldId":9,"code":"UNKNOWN_FIELD","message":"Unknown field #9."}]})"); pump();
    assert(label(lv_layer_top(), "Eingabe ungültig.") == serverError);
    assert(!label(lv_layer_top(), "Unknown field #9."));
    display.capture(output, "form-unknown-field-german");
    State::setUserLanguage(true, "en"); pump();
    assert(label(lv_layer_top(), "Invalid input.") == serverError);
    display.capture(output, "form-unknown-field-english");
    State::setUserLanguage(true, "de"); pump();
    assert(label(lv_layer_top(), "Eingabe ungültig.") == serverError);
    // Unknown identifiers and old servers without a code use English fallback.
    for (const auto *error : {R"({"fieldId":9,"code":"FUTURE_ERROR","message":"Unbekannter Fehler"})", R"({"fieldId":9,"message":"Alte Diagnose"})"}) {
        server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", std::string(R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":false,"errors":[)") + error + "]}"); pump();
        assert(label(lv_layer_top(), "Invalid input.") == serverError);
        assert(!label(lv_layer_top(), "Unbekannter Fehler") && !label(lv_layer_top(), "Alte Diagnose"));
    }
    click("Absenden", true);
    server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"valid":true})"); pump();
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeForm + 2);
    // Holding the original touch/card must not dismiss the new summary.
    display.touch = {240, 400, true}; pump();
    nfc.setPresent(0, true); pump();
    active = false; list(); // Broadcast may arrive before the committed stop reply.
    server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true,"durationSeconds":1426,"endedOwnSession":true,"billingSummary":{"amount":1250,"total":"12,50 EUR"}})"); pump();
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    assert(label(lv_screen_active(), "Danke, Alex!"));
    assert(label(lv_screen_active(), "00:23:46"));
    assert(label(lv_screen_active(), "12,50 EUR"));
    assert(!label(lv_layer_top(), "Gesamtkosten dieser Sitzung"));
    assert(!label(lv_screen_active(), "Nutzung beendet"));
    active = false; list();
    server.push("PROJECTS_OF_USER", R"({"page":1,"limit":10,"total":0,"projects":[]})"); pump();
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    setQuality(State::NETWORK_QUALITY_DEGRADED); pump();
    assert(lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    display.capture(output, "session-summary-billed");
    // The merged summary retains the authenticated user's locale and live bindings.
    auto *summaryGreeting = requireLabel(lv_screen_active(), "Danke, Alex!");
    State::setUserLanguage(true, "en"); pump();
    assert(State::getApiState().userAuthenticated);
    assert(label(lv_screen_active(), "Thank you, Alex!") == summaryGreeting);
    assert(label(lv_screen_active(), "Duration"));
    assert(label(lv_screen_active(), "Charged"));
    assert(label(lv_screen_active(), "See you soon!"));
    assert(label(lv_screen_active(), "00:23:46"));
    assert(label(lv_screen_active(), "12,50 EUR"));
    display.capture(output, "session-summary-billed-english");
    State::setUserLanguage(true, "de"); pump();
    assert(label(lv_screen_active(), "Danke, Alex!") == summaryGreeting);
    assert(label(lv_screen_active(), "Dauer"));
    assert(label(lv_screen_active(), "Abgerechnet"));
    assert(label(lv_screen_active(), "Bis bald!"));
    pump(300);
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    display.touch.pressed = false; nfc.setPresent(0, false); pump();
    const auto authBeforeSummaryCard = server.count("REQUEST_CARD_AUTHENTICATION_DATA");
    nfc.setPresent(0, true); pump(); nfc.setPresent(0, false);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(server.count("REQUEST_CARD_AUTHENTICATION_DATA") == authBeforeSummaryCard);
    assert(!lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    setQuality(State::NETWORK_QUALITY_GOOD); pump();
    assert(!label(lv_screen_active(), "Alex") || !lv_obj_is_visible(label(lv_screen_active(), "Alex")));
    login();
    // A separately running usage is unaffected by reader logout.
    active = true; list();
    const auto stopsBeforeLogout = server.count("STOP_RESOURCE_USAGE_SESSION");
    click("Abmelden");
    assert(!label(lv_screen_active(), "Alex") || !lv_obj_is_visible(requireLabel(lv_screen_active(), "Alex")));
    assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeLogout);
    display.capture(output, "07-logout-usage-preserved");
}
