#include "workflow.hpp"
#include "../controlled-clock.hpp"

void ReaderWorkflow::testTimeouts()
{
        server.push("READER_LANGUAGE", R"({"language":"en"})"); pump();
        login();
        const auto stopsBeforeTimeout = server.count("STOP_RESOURCE_USAGE_SESSION");
        const auto loginUtc = time(nullptr);
        TestClock::set(loginUtc + 86400); // SNTP-style forward correction
        pump();
        assert(lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
        TestClock::set(loginUtc - 86400); // backward correction must not extend expiry
        pump(31050);
        assert(!State::getApiState().userAuthenticated && State::getActiveLanguage() == "en");
        assert(label(lv_screen_active(), "Tap RFID card or open a resource"));
        server.push("READER_LANGUAGE", R"({"language":"de"})"); pump();
        assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeTimeout);
        std::cout << "PASS idle login expiry preserves running usage" << std::endl;
        active = false; login(); click("Start");
        pump(31050);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(label(lv_screen_active(), "Pausiert"));
        // An unconfirmed action gets a fresh 30-second status-refresh window.
        pump(30500);
        assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Abmelden")));
        assert(label(lv_screen_active(), "Status wird geladen"));
        // In place on "Start" once the refresh it waits for has arrived.
        assert(!label(lv_screen_active(), warned("Aktion nicht bestätigt").c_str()));
        list();
        assert(label(lv_screen_active(), warned("Aktion nicht bestätigt").c_str()));
        active = true; list();
        assert(lv_obj_is_visible(requireLabel(lv_screen_active(), "Abmelden")));
        std::cout << "PASS action pauses the real 30-second login timeout" << std::endl;
        click("Abmelden");
        // A status refresh that never arrives after an action on the details screen signs
        // out; the reason is shown on the signed-out screen that replaces the details.
        active = false; login(); click("Lasercutter");
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
        click("Ressource verwenden");
        {
            const auto id = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
            server.push("START_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(id) + R"(,"success":true})");
            pump();
        }
        pump(30500);
        // The message first, on a screen of its own; leaving it lands on the signed-out list.
        assert(lv_screen_active() == Display::statusScreen.getScreen() && !State::getApiState().userAuthenticated);
        assert(label(lv_screen_active(), "Status nicht verfügbar"));
        display.capture(output, "status-unavailable");
        // A card tapped meanwhile dismisses it and signs in as usual.
        {
            const auto requests = server.count("REQUEST_CARD_AUTHENTICATION_DATA");
            tapCard();
            assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !Display::transientActive());
            assert(server.count("REQUEST_CARD_AUTHENTICATION_DATA") == requests + 1);
            server.push("CARD_AUTHENTICATION_DATA", "{\"username\":\"" + username + R"(","language":"de","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true})");
            pump(250); nfc.setPresent(0, false); list();
            assert(State::getApiState().userAuthenticated);
            click("Abmelden");
            list(false);
        }
        std::cout << "PASS status timeout on the details screen explains itself; a card tap signs in" << std::endl;
        // Signed in from the lockscreen of a resource: the same message goes by itself after 6 s,
        // onto the signed-out screen the state dictates.
        click("Lasercutter");
        assert(lv_screen_active() == Display::lockscreen.getScreen());
        tapCard();
        server.push("CARD_AUTHENTICATION_DATA", "{\"username\":\"" + username + R"(","language":"de","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true})");
        pump(250); nfc.setPresent(0, false); list();
        assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
        click("Ressource verwenden");
        server.push("START_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(requestIdOf("START_RESOURCE_USAGE_SESSION")) + R"(,"success":true})");
        pump();
        pump(30500);
        assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Status nicht verfügbar"));
        pump(6300);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !Display::transientActive());
        assert(!State::getApiState().userAuthenticated && !Display::resourceDetailsScreen.isLoaded());
        std::cout << "PASS status timeout after a lockscreen sign-in returns by itself" << std::endl;
        // The top-up screen is open while the status refresh never arrives. After the 30-second
        // window the reader signs out, the screen is replaced and the reason is shown on the
        // screen that replaces it.
        active = false; login(); click("Start");
        {
            const auto id = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
            server.push("START_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(id) +
                        R"(,"error":"INSUFFICIENT_BALANCE","sumUpEnabled":true})");
            pump();
        }
        assert(lv_screen_active() == Display::topUpScreen.getScreen());
        pump(30500);
        assert(lv_screen_active() == Display::statusScreen.getScreen());
        assert(label(lv_screen_active(), "Status nicht verfügbar"));
        assert(!label(lv_screen_active(), "Unzureichendes Guthaben") && !State::getApiState().userAuthenticated);
        clearStatus();
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        std::cout << "PASS status timeout replaces the top-up screen and explains itself" << std::endl;
        // The ordinary session timeout keeps its semantics on the top-up screen: it signs out and replaces it.
        active = false; login(); click("Start");
        {
            const auto id = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
            server.push("START_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(id) +
                        R"(,"error":"INSUFFICIENT_BALANCE","sumUpEnabled":true})");
            pump();
            list(); // The refresh that follows a failed action, so only the session timeout is left.
        }
        assert(lv_screen_active() == Display::topUpScreen.getScreen());
        pump(30500);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !State::getApiState().userAuthenticated);
        assert(!label(lv_screen_active(), "Unzureichendes Guthaben") && !label(lv_screen_active(), "Status nicht verfügbar"));
        clearStatus();
        std::cout << "PASS session timeout replaces the top-up screen" << std::endl;
        // The session timeout signs out on every other screen shown over another one, too, and
        // leaves nothing of it behind. Usage forms pause it, like the action they belong to.
        const auto expectSignedOut = [&](const char *what) {
            if (lv_screen_active() != Display::resourceListScreen.getScreen() || Display::transientActive() ||
                State::getApiState().userAuthenticated)
                throw std::runtime_error(std::string("Session timeout left the reader on ") + what);
        };
        active = false; login();
        openDrawer(); click("Neustart", true);
        assert(lv_screen_active() == Display::confirmScreen.getScreen());
        pump(31050);
        expectSignedOut("the reboot confirmation");
        login(); click("Lasercutter"); click("Projekt wählen");
        assert(lv_screen_active() == Display::projectSelectScreen.getScreen());
        pump(31050);
        expectSignedOut("the project picker");
        assert(!Display::projectSelectScreen.isLoaded());
        active = true; flowButtons = {{"light", "Licht"}}; login(); click("Lasercutter");
        click("Licht"); flowButtons.clear(); list();
        failAction("TRIGGER_FLOW_BUTTON", "RESOURCE_LOCKED");
        list(); // The refresh after the failure: only the session timeout is left.
        assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Etwas ist schiefgelaufen"));
        pump(31050);
        expectSignedOut("a status screen");
        active = false; login(); click("Start");
        server.push("RESOURCE_USAGE_FORM_REQUEST", R"({"resourceId":1,"action":"start","forms":[{"id":8,"name":"Check","fieldCount":1}]})"); pump();
        assert(lv_screen_active() == Display::formsScreen.getScreen());
        pump(31050);
        assert(lv_screen_active() == Display::formsScreen.getScreen() && State::getApiState().userAuthenticated);
        // The server never sent the fields: Cancel still gets the reader out.
        assert(!lv_obj_has_state(buttonOf(lv_screen_active(), "Abbrechen"), LV_STATE_DISABLED));
        click("Abbrechen"); list();
        click("Abmelden"); list(false);
        std::cout << "PASS session timeout on confirmation, project picker and status; paused on forms" << std::endl;
        nfc.setPresent(0, true); pump(); nfc.setPresent(0, false); pump();
        // The waiting card-key request also rejects a competing web approval.
        server.push("SUPERVISION_START", R"({"resourceId":1,"requesterName":"Robin","timeoutMs":30000})"); pump();
        assert(lv_screen_active() != Display::supervisionScreen.getScreen());
        server.push("CARD_AUTHENTICATION_DATA", R"({"username":"Alex","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true})"); pump();
        pump(31050);
        assert(lv_screen_active() == Display::statusScreen.getScreen() && label(lv_screen_active(), "Anmeldung fehlgeschlagen"));
        clearStatus();
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Abmelden")));
        std::cout << "PASS lifted card authentication expires and recovers" << std::endl;
    }
