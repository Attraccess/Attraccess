#include "workflow.hpp"

void ReaderWorkflow::testIdentityAndPendingAuthentication()
{
    // Both the personalized identity and usage owner retain all 32 characters.
    username = "abcdefghijklmnopqrstuvwxyz012345";
    login();
    assert(label(lv_screen_active(), "Stop"));
    click("Stop"); server.push("STOP_RESOURCE_USAGE_SESSION", R"({"success":true})"); pump();
    active = false; list();
    assert(label(lv_screen_active(), "Start"));
    assert(!lv_obj_is_visible(requireLabel(lv_screen_active(), "Status wird geladen")));
    click("Abmelden"); username = "Alex"; active = true; list(false);
    login(); click("Abmelden");
    login(false);
    assert(label(lv_screen_active(), "Laden ..."));
    assert(!label(lv_screen_active(), "Stop"));
    list(); assert(label(lv_screen_active(), "Stop")); click("Abmelden");
    // Resource-first supervision works before the background list arrives.
    active = false; supervised = true; list(false); click("Lasercutter"); login(false);
    const auto unsupervisedStarts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Ressource verwenden");
    assert(lv_screen_active() == Display::supervisionScreen.getScreen());
    assert(server.count("START_RESOURCE_USAGE_SESSION") == unsupervisedStarts);
    pump(1100); click("Abbrechen"); list(); click(LV_SYMBOL_LEFT); click("Abmelden");
    supervised = false; active = true; list(false);
}
