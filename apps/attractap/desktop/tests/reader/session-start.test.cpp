#include "workflow.hpp"

void ReaderWorkflow::testSessionStart()
{
    const auto starts = server.count("START_RESOURCE_USAGE_SESSION");
    click("Start");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    assert(server.last("START_RESOURCE_USAGE_SESSION")["data"]["payload"]["resourceId"].as<int>() == 1);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    click("Start"); click("Abmelden"); click("CNC Fräse");
    assert(server.count("START_RESOURCE_USAGE_SESSION") == starts + 1);
    // The passive top-edge gesture must not bypass the blocking action overlay.
    display.touch = {240, 10, true}; pump();
    display.touch = {240, 140, true}; pump();
    display.touch.pressed = false; pump();
    assert(!lv_obj_is_visible(requireLabel(lv_layer_top(), FirmwareI18n::messageText(FirmwareI18n::Message::Maintenance, State::getActiveLanguage()))));
    display.capture(output, "03-pending-start");
    server.push("START_RESOURCE_USAGE_SESSION", R"({"success":true})"); pump();
    assert(server.count("REQUEST_RESOURCE_LIST") > 0);
    assert(label(lv_screen_active(), "Status wird geladen"));
    // An unrelated broadcast must not release the status refresh guard.
    list(true, false, false);
    assert(label(lv_screen_active(), "Status wird geladen"));
    active = true; list();
    assert(label(lv_screen_active(), "Stop"));
    display.capture(output, "04-started-list");
    click("Lasercutter");
    assert(lv_screen_active() == Display::resourceDetailsScreen.getScreen());
    assert(label(lv_screen_active(), "Alex"));
    auto *fullDescription = label(lv_screen_active(), longDescription.c_str());
    assert(fullDescription);
    lv_obj_update_layout(lv_screen_active());
    assert(lv_label_get_long_mode(fullDescription) == LV_LABEL_LONG_SCROLL);
    assert(lv_obj_get_height(fullDescription) == 28);
    lv_obj_get_coords(fullDescription, &fullDescriptionBounds);
    assert(server.count("RESOURCE_USAGE_STATS") == 1);
}
