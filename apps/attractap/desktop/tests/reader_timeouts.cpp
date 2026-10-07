#include "reader_workflow.hpp"

void ReaderWorkflow::testTimeouts()
{
        login();
        const auto stopsBeforeTimeout = server.count("STOP_RESOURCE_USAGE_SESSION");
        pump(31050);
        assert(!lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
        assert(server.count("STOP_RESOURCE_USAGE_SESSION") == stopsBeforeTimeout);
        std::cout << "PASS idle login expiry preserves running usage" << std::endl;
        active = false; login(); click("Start");
        pump(31050);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(label(lv_screen_active(), "Pausiert"));
        // An unconfirmed action gets a fresh 30-second status-refresh window.
        pump(30500);
        assert(lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
        assert(label(lv_screen_active(), "Status wird geladen"));
        assert(label(lv_layer_top(), "Aktion nicht bestätigt"));
        Display::hidePopup(); active = true; list();
        assert(lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
        std::cout << "PASS action pauses the real 30-second login timeout" << std::endl;
        click("Abmelden");
        nfc.setPresent(0, true); pump(); nfc.setPresent(0, false); pump();
        // The waiting card-key request also rejects a competing web approval.
        server.push("SUPERVISION_START", R"({"resourceId":1,"requesterName":"Robin","timeoutMs":30000})"); pump();
        assert(lv_screen_active() != Display::supervisionScreen.getScreen());
        server.push("CARD_AUTHENTICATION_DATA", R"({"username":"Alex","keyNo":0,"key":"00000000000000000000000000000000","hasIntroduction":true})"); pump();
        pump(31050);
        assert(lv_screen_active() == Display::resourceListScreen.getScreen());
        assert(!lv_obj_is_visible(label(lv_screen_active(), "Abmelden")));
        assert(label(lv_layer_top(), "Anmeldung fehlgeschlagen"));
        std::cout << "PASS lifted card authentication expires and recovers" << std::endl;
}
