#include "fixtures.hpp"

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

namespace
{
    // A notice is the only descendant that holds this caption.
    lv_obj_t *noticeOf(lv_obj_t *root, const char *title)
    {
        auto *label = findLabel(root, title);
        return label ? lv_obj_get_parent(label) : nullptr;
    }
}

void testScreenNotices(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    Display::transitionToScreen(&Display::lockscreen);
    Display::loop();
    Display::showErrorNotice(FirmwareI18n::Message::SignInFailed, FirmwareI18n::Message::PleaseTapAValidNfcCard);
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "notice-error.png");
    auto *notice = noticeOf(Display::lockscreen.getScreen(), "Anmeldung fehlgeschlagen");
    assert(notice && lv_obj_is_visible(notice));
    // It belongs to the screen, not to the top layer, and floats above the layout.
    assert(lv_obj_get_screen(notice) == Display::lockscreen.getScreen());
    assert(!findLabel(lv_layer_top(), "Anmeldung fehlgeschlagen"));
    assert(lv_obj_has_flag(notice, LV_OBJ_FLAG_FLOATING));
    // Clear of the network badge (top right) and the device footer (bottom).
    lv_area_t area;
    lv_obj_update_layout(Display::lockscreen.getScreen());
    lv_obj_get_coords(notice, &area);
    assert(area.y1 >= 42 && area.y2 < 440);

    // One at a time: a newer notice replaces the older one.
    Display::showNotice(ScreenNotice::Kind::Info, FirmwareI18n::Message::SessionTotal, FirmwareI18n::Text::literal("2,90 EUR") /* i18n-data: Test fixture amount. */);
    assert(!findLabel(Display::lockscreen.getScreen(), "Anmeldung fehlgeschlagen"));
    assert(findLabel(Display::lockscreen.getScreen(), "2,90 EUR"));
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "notice-info.png");

    // Tapping dismisses it.
    lv_obj_send_event(noticeOf(Display::lockscreen.getScreen(), "Gesamtkosten dieser Sitzung"), LV_EVENT_CLICKED, nullptr);
    assert(!findLabel(Display::lockscreen.getScreen(), "2,90 EUR"));

    // A transition removes the notice of the screen that is left.
    Display::showErrorNotice(FirmwareI18n::Message::SignInFailed, FirmwareI18n::Message::PleaseTapAValidNfcCard);
    Display::loop(); // A later tick: the notice is not part of the next transition's event.
    Display::transitionToScreen(&Display::resourceListScreen);
    assert(!findLabel(Display::resourceListScreen.getScreen(), "Anmeldung fehlgeschlagen"));
    assert(!findLabel(Display::lockscreen.getScreen(), "Anmeldung fehlgeschlagen"));

    // A notice raised by the event behind a transition lands on the destination.
    Display::showErrorNotice(FirmwareI18n::Message::StatusUnavailable, FirmwareI18n::Message::SignInAgainToLoadTheCurrentResourceStatus);
    Display::transitionToScreen(&Display::lockscreen);
    assert(findLabel(Display::lockscreen.getScreen(), "Status nicht verfügbar"));
    assert(!findLabel(Display::resourceListScreen.getScreen(), "Status nicht verfügbar"));

    // Screens may be destroyed while showing one; nothing dangles afterwards.
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
    Display::lockscreen.destroy();
    Display::showErrorNotice(FirmwareI18n::Message::SignInFailed, FirmwareI18n::Message::PleaseTapAValidNfcCard);
    Display::clearNotice();
    Display::loop();
}
