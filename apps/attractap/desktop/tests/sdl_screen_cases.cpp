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
