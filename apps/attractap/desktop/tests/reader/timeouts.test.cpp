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
        assert(label(lv_screen_active(), "Aktion nicht bestätigt"));
        clearStatus(); active = true; list();
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
        clearStatus();
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        std::cout << "PASS status timeout on the details screen explains itself on the list" << std::endl;
        // The top-up screen is open while the status refresh never arrives. After the 30-second
        // window the reader signs out, the screen is replaced and the reason is shown on the
        // screen that replaces it.
        active = false; login(); click("Start");
        {
            const auto id = server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["requestId"].as<uint32_t>();
            server.push("START_RESOURCE_USAGE_SESSION", "{\"requestId\":" + std::to_string(id) +
                        R"(,"success":false,"error":"INSUFFICIENT_BALANCE","sumUpEnabled":true})");
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
                        R"(,"success":false,"error":"INSUFFICIENT_BALANCE","sumUpEnabled":true})");
            pump();
            list(); // The refresh that follows a failed action, so only the session timeout is left.
        }
        assert(lv_screen_active() == Display::topUpScreen.getScreen());
        pump(30500);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !State::getApiState().userAuthenticated);
        assert(!label(lv_screen_active(), "Unzureichendes Guthaben") && !label(lv_screen_active(), "Status nicht verfügbar"));
        clearStatus();
        std::cout << "PASS session timeout replaces the top-up screen" << std::endl;
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
