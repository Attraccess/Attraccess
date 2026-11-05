#include "workflow.hpp"

// Results, confirmations, top-up, usage forms and the project picker are screens of their own.
// Whatever changes the screen takes them away. (Errors in place on a button: button-errors and
// form-errors.)
void ReaderWorkflow::testScreenOwnedUi()
{
    supervised = false; active = false;
    login();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    // A result that belongs to no button is only logged.
    const auto screenBefore = lv_screen_active();
    server.push("RESOURCE_LIST", R"({"error":"INTERNAL_ERROR"})"); pump();
    server.push("READER_LANGUAGE", R"({"error":"INTERNAL_ERROR"})"); pump();
    assert(lv_screen_active() == screenBefore && !Display::transientActive());

    // Usage started: a full-screen success with the resource name, back to the list by a tap.
    click("Start");
    server.push("START_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>()) + ",\"success\":true}"); pump();
    active = true; list();
    assert(lv_screen_active() == Display::statusScreen.getScreen());
    assert(label(lv_screen_active(), "Nutzung gestartet") && label(lv_screen_active(), "Lasercutter"));
    display.capture(output, "usage-started");
    clearStatus();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen() && label(lv_screen_active(), "Stop"));
    // It goes on its own, too.
    click("Stop");
    server.push("STOP_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>()) + ",\"success\":true,\"billingSummary\":{\"amount\":290,\"total\":\"2,90 EUR\"}}"); pump();
    active = false; list();
    // A stop that is not the signed-in user's own session reports the total on its own screen.
    assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "2,90 EUR") && label(lv_screen_active(), "Gesamtkosten dieser Sitzung"));
    display.capture(output, "billing-total");
    pump(8300);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());

    // Insufficient balance with a payment terminal: the top-up screen over the screen it came from.
    const auto balanceFailure = [&](bool sumUp) {
        server.push("START_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(requestIdOf("START_RESOURCE_USAGE_SESSION")) +
                    R"(,"error":"INSUFFICIENT_BALANCE","sumUpEnabled":)" + (sumUp ? "true}" : "false}"));
        pump(); list();
    };
    click("Start");
    balanceFailure(false);
    assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Unzureichendes Guthaben"));
    clearStatus();
    click("Start");
    balanceFailure(true);
    assert(lv_screen_active() == Display::topUpScreen.getScreen());
    display.capture(output, "top-up-screen");
    click("Abbrechen");
    assert(lv_screen_active() == Display::resourceListScreen.getScreen() && server.count("BILLING_REQUEST_TOPUP") == 0);
    click("Lasercutter");
    click("Ressource verwenden");
    balanceFailure(true);
    assert(lv_screen_active() == Display::topUpScreen.getScreen());
    click("7"); click("Aufladen");
    assert(server.last("BILLING_REQUEST_TOPUP")["data"]["payload"]["amountCents"].as<uint32_t>() == 700);
    assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Bitte am Zahlungsterminal fortfahren."));
    pump(6300);
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    // The server refuses the request: back to the amount, the reason in place on "Aufladen".
    server.push("BILLING_REQUEST_TOPUP", R"({"error":"CARD_NOT_ACTIVE"})"); pump();
    assert(lv_screen_active() == Display::topUpScreen.getScreen() && label(lv_screen_active(), warned("Karte ist nicht aktiv").c_str()));
    click("Abbrechen");
    click(LV_SYMBOL_LEFT);
    // The refusal usually arrives while "continue at the payment terminal" is still showing.
    click("Lasercutter"); click("Ressource verwenden");
    balanceFailure(true);
    click("7"); click("Aufladen");
    assert(lv_screen_active() == Display::statusScreen.getScreen());
    server.push("BILLING_REQUEST_TOPUP", R"({"error":"SUMUP_TOPUP_FAILED"})"); pump();
    assert(lv_screen_active() == Display::topUpScreen.getScreen() && label(lv_screen_active(), "Aufladen"));
    click("Abbrechen");
    click(LV_SYMBOL_LEFT);

    // Server-driven transitions take every one of these screens away and leave nothing behind.
    const auto disconnect = [&] {
        State::setWebsocketState(false, "reader.test", 80, false); pump();
        assert(lv_screen_active() == Display::initScreen.getScreen());
        assert(!label(lv_screen_active(), "Unzureichendes Guthaben") && !label(lv_screen_active(), "Zurück") && !Display::transientActive());
        State::setWebsocketState(true, "reader.test", 80, false);
        State::setApiState(true, "Test reader"); pump();
        list(false);
        login();
    };
    click("Lasercutter"); click("Ressource verwenden");
    balanceFailure(true);
    assert(lv_screen_active() == Display::topUpScreen.getScreen());
    disconnect();
    click("Lasercutter");
    click("Projekt wählen");
    assert(lv_screen_active() == Display::projectSelectScreen.getScreen());
    disconnect();
    active = true; list(); click("Stop");
    server.push("RESOURCE_USAGE_FORM_REQUEST", R"({"resourceId":1,"action":"end","forms":[{"id":8,"name":"Check","fieldCount":1}]})"); pump();
    server.push("RESOURCE_USAGE_FORM_FIELDS", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":9,"name":"Sichtprüfung","type":"text","isRequired":true,"value":"OK"}]})"); pump();
    assert(lv_screen_active() == Display::formsScreen.getScreen());
    disconnect();
    assert(!Display::formsScreen.isLoaded());
    active = false; list();

    // The status screens end where the application's state sends the reader.
    click("Abmelden");
    list(false);
    click("Lasercutter");
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    nfc.setPresent(0, false); pump(); nfc.setPresent(0, true); pump();
    server.push("CARD_AUTHENTICATION_DATA", R"({"username":"Wrong card","language":"de","keyNo":0,"key":"11111111111111111111111111111111"})"); pump();
    assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Anmeldung fehlgeschlagen"));
    display.capture(output, "sign-in-failed");
    // A card tapped meanwhile dismisses it and signs in as usual.
    const auto requests = server.count("REQUEST_CARD_AUTHENTICATION_DATA");
    nfc.setPresent(0, false); pump(); nfc.setPresent(0, true); pump();
    assert(lv_screen_active() != Display::statusScreen.getScreen());
    assert(server.count("REQUEST_CARD_AUTHENTICATION_DATA") == requests + 1);
    nfc.setPresent(0, false); pump();
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_NOT_FOUND"})"); pump();
    assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Karte nicht gefunden"));
    clearStatus();
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    click(LV_SYMBOL_LEFT);
    login();

    // The project list could not be loaded: the list area says so and offers another try.
    click("Lasercutter");
    click("Projekt wählen");
    server.push("PROJECTS_OF_USER", R"({"error":"INTERNAL_ERROR"})"); pump();
    assert(lv_screen_active() == Display::projectSelectScreen.getScreen() && label(lv_screen_active(), "Projekte konnten nicht geladen werden"));
    display.capture(output, "project-load-error");
    const auto projectRequests = server.count("PROJECTS_OF_USER");
    click("Erneut versuchen");
    assert(server.count("PROJECTS_OF_USER") == projectRequests + 1);
    click("Abbrechen");
    click(LV_SYMBOL_LEFT);

    // The maintenance drawer asks for the reboot on a screen of its own, over the current one.
    openDrawer();
    assert(lv_obj_is_visible(requireLabel(lv_layer_top(), "Wartung")));
    click("Neustart", true);
    assert(lv_screen_active() == Display::confirmScreen.getScreen());
    display.capture(output, "drawer-reboot-confirm");
    assert(!lv_obj_is_visible(requireLabel(lv_layer_top(), "Wartung"))); // The drawer closed.
    openDrawer(); // No drawer, and no second confirmation, over a confirmation.
    assert(!lv_obj_is_visible(requireLabel(lv_layer_top(), "Wartung")) && lv_screen_active() == Display::confirmScreen.getScreen());
    click("Abbrechen");
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    // A server-driven transition replaces the confirmation as well.
    openDrawer(); click("Neustart", true);
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(lv_screen_active() == Display::initScreen.getScreen() && !label(lv_screen_active(), "Gerät neu starten?"));
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); pump();
    list(false);
    login();
    std::cout << "PASS screen-owned results, confirmations, top-up, forms and button errors" << std::endl;
}
