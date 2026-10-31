#include "workflow.hpp"

// Notices, the top-up screen, the usage forms and the drawer confirm all belong
// to a screen: whatever changes the screen takes them away.
void ReaderWorkflow::testScreenOwnedUi()
{
    supervised = false; active = false;
    login();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    const auto noticeShown = [&](const char *title) { return label(lv_screen_active(), title) != nullptr; };
    const auto startFailsWithBalance = [&](bool sumUp) {
        const auto before = server.count("START_RESOURCE_USAGE_SESSION");
        click(lv_screen_active() == Display::resourceDetailsScreen.getScreen() ? "Ressource verwenden" : "Start");
        assert(server.count("START_RESOURCE_USAGE_SESSION") == before + 1);
        const auto id = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
        server.push("START_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(id) +
                    R"(,"success":false,"error":"INSUFFICIENT_BALANCE","sumUpEnabled":)" + (sumUp ? "true}" : "false}"));
        pump();
        list(); // The refresh that follows every failed action; it must not disturb the screen.
    };
    const std::function<lv_obj_t *(lv_obj_t *)> findTextarea = [&](lv_obj_t *object) -> lv_obj_t * {
        if (lv_obj_check_type(object, &lv_textarea_class)) return object;
        for (uint32_t i = 0; i < lv_obj_get_child_count(object); ++i)
            if (auto *found = findTextarea(lv_obj_get_child(object, i))) return found;
        return nullptr;
    };

    // A failure reported by an API callback (after the render pass) while the
    // next pass routes away (a start from the list ran its form on the details
    // screen) is shown on the list it returns to.
    {
        click("Start");
        const auto id = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
        server.push("RESOURCE_USAGE_FORM_REQUEST", "{\"resourceId\":1,\"action\":\"start\",\"requestId\":" + std::to_string(id) +
                    R"(,"forms":[{"id":8,"name":"Check","fieldCount":1}]})"); pump();
        server.push("RESOURCE_USAGE_FORM_FIELDS", R"({"resourceId":1,"action":"start","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":9,"name":"Sichtprüfung","type":"text","isRequired":true,"value":"OK"}]})"); pump();
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
        const auto startsBeforeSubmit = server.count("START_RESOURCE_USAGE_SESSION");
        click("Absenden");
        server.push("RESOURCE_USAGE_FORM_PAGE_RESULT", R"({"resourceId":1,"action":"start","formId":8,"offset":0,"valid":true})"); pump();
        assert(server.count("START_RESOURCE_USAGE_SESSION") == startsBeforeSubmit + 1);
        const auto retry = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
        server.push("START_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(retry) + R"(,"success":false,"error":"Denied by test"})");
        pump();
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(noticeShown("Aktion fehlgeschlagen"));
        list();
        assert(noticeShown("Aktion fehlgeschlagen"));
        Display::clearNotice();
    }

    // Insufficient balance without a payment terminal: a notice inside the screen.
    startFailsWithBalance(false);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(noticeShown("Aktion fehlgeschlagen"));
    assert(!label(lv_layer_top(), "Aktion fehlgeschlagen"));
    display.capture(output, "notice-action-failed");
    // Errors stay for 8 seconds, then hide themselves.
    pump(4500);
    assert(noticeShown("Aktion fehlgeschlagen"));
    pump(3600);
    assert(!noticeShown("Aktion fehlgeschlagen"));

    // With a terminal the top-up screen is routed like any other screen.
    startFailsWithBalance(true);
    assert(lv_screen_active() == Display::topUpScreen.getScreen());
    assert(!label(lv_screen_active(), "Aktion fehlgeschlagen"));
    display.capture(output, "top-up-screen");
    click("Abbrechen");
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(server.count("BILLING_REQUEST_TOPUP") == 0);

    // The same from the details screen: cancel returns there, Top up asks for euros x 100.
    click("Lasercutter");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    startFailsWithBalance(true);
    assert(lv_screen_active() == Display::topUpScreen.getScreen());
    click("Abbrechen");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    startFailsWithBalance(true);
    click("Aufladen");
    assert(lv_screen_active() == Display::topUpScreen.getScreen() && label(lv_screen_active(), "Bitte Betrag eingeben."));
    assert(server.count("BILLING_REQUEST_TOPUP") == 0);
    lv_textarea_set_text(findTextarea(lv_screen_active()), "7");
    click("Aufladen");
    assert(server.last("BILLING_REQUEST_TOPUP")["data"]["payload"]["amountCents"].as<uint32_t>() == 700);
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(noticeShown("Bitte am Zahlungsterminal fortfahren ..."));
    display.capture(output, "notice-payment-terminal");
    Display::clearNotice();
    click(LV_SYMBOL_LEFT);

    // A server-driven transition takes the top-up screen (and any notice) with it.
    startFailsWithBalance(true);
    assert(lv_screen_active() == Display::topUpScreen.getScreen());
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(lv_screen_active() == Display::initScreen.getScreen());
    assert(!label(lv_screen_active(), "Unzureichendes Guthaben") && !label(lv_layer_top(), "Unzureichendes Guthaben"));
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); pump();
    list(false);

    // A notice on the list or details disappears when the server ends the session.
    login();
    Display::showErrorNotice(FirmwareI18n::Message::ActionFailed, FirmwareI18n::Message::PleaseTryAgain);
    pump();
    assert(noticeShown("Aktion fehlgeschlagen"));
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(lv_screen_active() == Display::initScreen.getScreen());
    assert(!noticeShown("Aktion fehlgeschlagen"));
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); pump();
    list(false);

    // The same for a server message that routes away without ending the session:
    // a resource list without the open resource returns to the list.
    login(); click("CNC Fräse");
    Display::showErrorNotice(FirmwareI18n::Message::ActionFailed, FirmwareI18n::Message::PleaseTryAgain);
    pump();
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen() && noticeShown("Aktion fehlgeschlagen"));
    list(true, true);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen() && State::getApiState().userAuthenticated);
    assert(!noticeShown("Aktion fehlgeschlagen"));
    list();

    click("Lasercutter");
    Display::showErrorNotice(FirmwareI18n::Message::ActionFailed, FirmwareI18n::Message::PleaseTryAgain);
    pump();
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen() && noticeShown("Aktion fehlgeschlagen"));
    active = true; list(); // Own running session: the stop ends in the full-screen summary.
    click("Sitzung beenden");
    {
        const auto id = server.last("STOP_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
        server.push("STOP_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(id) +
                    R"(,"success":true,"durationSeconds":60,"endedOwnSession":true})");
        pump();
    }
    assert(lv_screen_active() == Display::sessionSummaryScreen.getScreen());
    assert(!noticeShown("Aktion fehlgeschlagen"));
    pump(3700);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !noticeShown("Aktion fehlgeschlagen"));
    active = false;

    // Sign-in failures are visible on the screen the card is presented on.
    list(false); // The summary has signed the reader out again.
    click("Lasercutter");
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    nfc.setPresent(0, false); pump(); nfc.setPresent(0, true); pump();
    server.push("CARD_AUTHENTICATION_DATA", R"({"username":"Wrong card","language":"de","keyNo":0,"key":"11111111111111111111111111111111"})"); pump();
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    assert(noticeShown("Anmeldung fehlgeschlagen"));
    display.capture(output, "notice-lockscreen-sign-in-failed");
    nfc.setPresent(0, false); pump();
    Display::clearNotice();

    // Usage forms live inside the details screen: leaving it removes them.
    active = true; list(false); login(); // Selecting a resource before signing in opens its details.
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    click("Sitzung beenden");
    server.push("RESOURCE_USAGE_FORM_REQUEST", R"({"resourceId":1,"action":"end","forms":[{"id":8,"name":"Check","fieldCount":1}]})"); pump();
    server.push("RESOURCE_USAGE_FORM_FIELDS", R"({"resourceId":1,"action":"end","formId":8,"offset":0,"totalFieldCount":1,"fields":[{"id":9,"name":"Sichtprüfung","type":"text","isRequired":true,"value":"OK"}]})"); pump();
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Absenden")));
    assert(!label(lv_layer_top(), "Absenden"));
    State::setWebsocketState(false, "reader.test", 80, false); pump();
    assert(lv_screen_active() == Display::initScreen.getScreen());
    assert(!label(lv_layer_top(), "Absenden") && !label(lv_screen_active(), "Absenden"));
    assert(!Display::resourceDetailsScreen.isLoaded());
    State::setWebsocketState(true, "reader.test", 80, false);
    State::setApiState(true, "Test reader"); pump();
    list(false);
    active = false;

    // The maintenance drawer swaps to its own reboot confirm and resets on close.
    const auto openDrawer = [&] {
        display.touch = {240, 10, true}; pump();
        display.touch = {240, 150, true}; pump();
        display.touch.pressed = false; pump();
    };
    const auto visible = [&](const char *text) { return lv_obj_is_visible(requireLabel(lv_layer_top(), text)); };
    // The visible button with this caption on the top layer.
    const std::function<lv_obj_t *(lv_obj_t *, const char *)> shownButton = [&](lv_obj_t *root, const char *text) -> lv_obj_t * {
        if (lv_obj_check_type(root, &lv_label_class) && std::strcmp(lv_label_get_text(root), text) == 0 && lv_obj_is_visible(root))
            return lv_obj_get_parent(root);
        for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
            if (auto *found = shownButton(lv_obj_get_child(root, i), text)) return found;
        return nullptr;
    };
    openDrawer();
    assert(visible("Wartung") && !visible("Gerät neu starten?"));
    lv_obj_update_layout(lv_layer_top());
    lv_area_t rebootArea, confirmArea;
    lv_obj_get_coords(shownButton(lv_layer_top(), "Neustart"), &rebootArea);
    click("Neustart", true);
    assert(visible("Gerät neu starten?") && !visible("Wartung"));
    display.capture(output, "drawer-reboot-confirm");
    // A second tap where Reboot was cannot confirm: the confirm's Reboot is elsewhere.
    lv_obj_update_layout(lv_layer_top());
    lv_obj_get_coords(shownButton(lv_layer_top(), "Neustart"), &confirmArea);
    assert(confirmArea.y1 > rebootArea.y2 || confirmArea.y2 < rebootArea.y1 ||
           confirmArea.x1 > rebootArea.x2 || confirmArea.x2 < rebootArea.x1);
    click("Abbrechen", true);
    assert(visible("Wartung") && !visible("Gerät neu starten?"));
    click("Neustart", true);
    display.touch = {240, 400, true}; pump(); display.touch.pressed = false; pump(); // Backdrop closes the drawer.
    assert(!visible("Gerät neu starten?") && !visible("Wartung"));
    openDrawer();
    assert(visible("Wartung") && !visible("Gerät neu starten?"));
    display.touch = {240, 400, true}; pump(); display.touch.pressed = false; pump();
    assert(!visible("Wartung"));
    std::cout << "PASS screen-owned notices, top-up, forms and drawer confirm" << std::endl;
}
