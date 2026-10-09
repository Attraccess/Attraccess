#include "sdl_display_fixtures.hpp"

void testLockscreen(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    // Exercise selection -> lockscreen with the simulator's production theme,
    // router and SDL renderer, rather than just inspecting a font asset.
    constexpr char resourceName[] = "Jappys Dingalüng";
    API::ResourceList resources{};
    resources.count = 1;
    resources.items[0].id = 1;
    std::strcpy(resources.items[0].name, resourceName);
    Display::resourceListScreen.setResourceList(resources);
    Display::resourceListScreen.setResourceSelectionCallback([](const API::ResourceBrief &resource) {
        Display::lockscreen.setResourceName(resource.name);
        Display::lockscreen.setUsageInfo(false, "", false);
        Display::transitionToScreen(&Display::lockscreen);
    });
    Display::transitionToScreen(&Display::resourceListScreen);
    lv_refr_now(nullptr);
    auto *selectionLabel = findLabel(lv_screen_active(), resourceName);
    expectUmlaut(selectionLabel);
    lv_obj_send_event(lv_obj_get_parent(selectionLabel), LV_EVENT_CLICKED, nullptr);
    Display::loop();
    lv_refr_now(nullptr);
    assert(lv_screen_active() == Display::lockscreen.getScreen());
    expectUmlaut(findLabel(lv_screen_active(), resourceName));
    expectUmlaut(findLabel(lv_screen_active(), "Verfügbar"));
    assert(display.pollEvents());
    screenshot(screenshots, "lockscreen-umlaut.png");
    Display::resourceListScreen.setResourceSelectionCallback({});
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
    lv_refr_now(nullptr);
}

void testSessionSummaryLifecycle()
{
    auto &summary = Display::sessionSummaryScreen;
    summary.setSummary("München", 1440, "2,90 EUR");
    Display::transitionToScreen(&summary); Display::loop(); lv_refr_now(nullptr);
    assert(findLabel(lv_screen_active(), "Danke, München!"));
    assert(findLabel(lv_screen_active(), "00:24:00"));
    auto *root = summary.getScreen();
    summary.init(); assert(summary.getScreen() == root);
    Display::transitionToScreen(&Display::lockscreen); Display::loop();
    assert(!summary.isLoaded());
    summary.destroy(); // Safe even after router retirement.
    summary.setSummary("Alex", UINT32_MAX, "");
    Display::transitionToScreen(&summary); Display::loop(); lv_refr_now(nullptr);
    assert(findLabel(lv_screen_active(), "1193046:28:15"));
    assert(!findLabel(lv_screen_active(), "Abgerechnet"));
    assert(!findLabel(lv_screen_active(), "2,90 EUR"));
    Display::transitionToScreen(&Display::lockscreen); Display::loop();
}
