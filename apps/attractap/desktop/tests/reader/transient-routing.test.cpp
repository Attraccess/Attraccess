#include "workflow.hpp"

// Screens shown over another one (status, confirmation, top-up, forms, project picker) never
// keep the reader from where the application's state sends it, and the maintenance drawer does
// not open over them.
void ReaderWorkflow::testTransientRouting()
{
    supervised = false; active = false;
    login();
    const char *start = "START_RESOURCE_USAGE_SESSION";
    const auto refuseBalance = [&](bool sumUp) {
        server.push(start, "{\"requestId\":" + std::to_string(requestIdOf(start)) +
                               R"(,"error":"INSUFFICIENT_BALANCE","sumUpEnabled":)" + (sumUp ? "true}" : "false}"));
        pump(); list();
    };

    // No drawer over the project picker, a status screen or the top-up screen: its reboot
    // question would park them while the application still waits on them.
    click("Lasercutter");
    click("Projekt wählen");
    assert(lv_screen_active() == Display::projectSelectScreen.getScreen());
    openDrawer();
    assert(!drawerOpen() && lv_screen_active() == Display::projectSelectScreen.getScreen());
    click("Abbrechen");
    click("Ressource verwenden");
    refuseBalance(false);
    assert(lv_screen_active() == Display::statusScreen.getScreen());
    openDrawer();
    assert(!drawerOpen() && lv_screen_active() == Display::statusScreen.getScreen());
    clearStatus();
    click("Ressource verwenden");
    refuseBalance(true);
    assert(lv_screen_active() == Display::topUpScreen.getScreen());
    openDrawer();
    assert(!drawerOpen() && lv_screen_active() == Display::topUpScreen.getScreen());
    click("Abbrechen");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    click(LV_SYMBOL_LEFT);

    // The resources go away (server-driven sign-out) while each screen is up: the reader ends on
    // the "no resources" screen, nothing of the screen is left, and comes back to the list.
    const auto resourcesGone = [&](const char *what) {
        ++listVersion;
        server.push("RESOURCE_LIST", "{\"messageId\":" + std::to_string(listVersion) + ",\"revision\":" + std::to_string(listVersion) +
                                         R"(,"authenticatedUsername":"","resources":[]})");
        pump();
        if (lv_screen_active() != Display::noResourcesScreen.getScreen() || Display::transientActive() || State::getApiState().userAuthenticated)
            throw std::runtime_error(std::string("Still on a screen after the resources went away: ") + what);
        list(false);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        login();
    };
    openDrawer();
    click("Neustart", true);
    assert(lv_screen_active() == Display::confirmScreen.getScreen());
    resourcesGone("confirm");
    click("Lasercutter");
    click("Projekt wählen");
    resourcesGone("project picker");
    click("Start");
    server.push("RESOURCE_USAGE_FORM_REQUEST", R"({"resourceId":1,"action":"start","forms":[{"id":8,"name":"Check","fieldCount":1}]})"); pump();
    assert(lv_screen_active() == Display::formsScreen.getScreen());
    resourcesGone("forms");
    click("Start");
    refuseBalance(false);
    assert(lv_screen_active() == Display::statusScreen.getScreen());
    resourcesGone("status");

    // The reboot question goes with the drawer: a card tapped meanwhile signs in, which takes
    // the drawer away, and the question with it.
    click("Abmelden");
    list(false);
    openDrawer();
    click("Neustart", true);
    assert(lv_screen_active() == Display::confirmScreen.getScreen());
    tapCard();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !Display::transientActive());
    assert(server.count("REQUEST_CARD_AUTHENTICATION_DATA") > 0);
    server.push("CARD_AUTHENTICATION_DATA", "{\"username\":\"" + username + R"(","language":"de","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true})");
    pump(250); nfc.setPresent(0, false); list();
    assert(label(lv_screen_active(), "Abmelden") && lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));

    // "Sign-in failed" answers a card that was tapped. An error for card data nobody asked
    // for, while signed in, is only logged.
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_NOT_FOUND"})"); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !Display::transientActive());
    assert(State::getApiState().userAuthenticated);
    click("Abmelden");
    list(false);
    tapCard();
    server.push("CARD_AUTHENTICATION_DATA", R"({"error":"CARD_NOT_FOUND"})"); pump();
    nfc.setPresent(0, false); pump();
    assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Karte nicht gefunden"));
    // A card tapped meanwhile dismisses it and signs in as usual.
    const auto requests = server.count("REQUEST_CARD_AUTHENTICATION_DATA");
    tapCard();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !Display::transientActive());
    assert(server.count("REQUEST_CARD_AUTHENTICATION_DATA") == requests + 1);
    server.push("CARD_AUTHENTICATION_DATA", "{\"username\":\"" + username + R"(","language":"de","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true})");
    pump(250); nfc.setPresent(0, false); list();
    assert(State::getApiState().userAuthenticated);
    // A drawer that is open when a full-screen flow appears under it (a late top-up refusal)
    // closes, and its reboot question is not asked from there.
    click("Lasercutter");
    click("Ressource verwenden");
    refuseBalance(true);
    click("7"); click("Aufladen");
    assert(lv_screen_active() == Display::statusScreen.getScreen());
    pump(6300); // "Continue at the payment terminal" returns by itself.
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    openDrawer();
    assert(drawerOpen());
    server.push("BILLING_REQUEST_TOPUP", R"({"error":"NO_SUMUP_TERMINALS_AVAILABLE"})"); pump();
    assert(lv_screen_active() == Display::topUpScreen.getScreen() && !drawerOpen());
    click("Neustart", true);
    assert(lv_screen_active() == Display::topUpScreen.getScreen());
    click("Abbrechen");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    // A top-up refusal that arrives after its user signed out does not reach the next one.
    click("Ressource verwenden");
    refuseBalance(true);
    click("7"); click("Aufladen");
    pump(6300);
    click("Abmelden");
    list(false);
    login();
    server.push("BILLING_REQUEST_TOPUP", R"({"error":"NO_SUMUP_TERMINALS_AVAILABLE"})"); pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !Display::transientActive());
    click("Abmelden");
    list(false);
    std::cout << "PASS screens over screens follow the application's routing; no drawer over them" << std::endl;
}
