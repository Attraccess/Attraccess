#include "fixtures.hpp"
#include "platform.hpp"

void testLockscreen(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    // Exercise selection -> lockscreen with the simulator's production theme,
    // router and SDL renderer, rather than just inspecting a font asset.
    constexpr char resourceName[] = "Fräse";
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
    constexpr char longName[] = "Lasercutter Großformat mit extrem langem Maschinennamen und Zusatz";

    StatusScreen::Config longError()
    {
        return StatusScreen::error(FirmwareI18n::Message::SignInFailed,
                                   FirmwareI18n::Text::literal("Eine sehr lange Fehlermeldung vom Server, die mehrere Zeilen braucht, ohne etwas zu überdecken.") /* i18n-data: Test fixture. */);
    }
}

void testStatusScreens(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    Display::transitionToScreen(&Display::resourceListScreen);
    Display::loop();
    int shot = 0;
    for (const char *language : {"de", "en"})
    {
        State::setDefaultLanguage(language);
        Display::loop();
        const std::vector<std::pair<const char *, StatusScreen::Config>> variants = {
            {"error", longError()},
            {"error-short", StatusScreen::error(FirmwareI18n::Message::SignInFailed, FirmwareI18n::Message::PleaseTapAValidNfcCard)},
            {"success", StatusScreen::success(FirmwareI18n::Message::UsageStarted, FirmwareI18n::Text::literal(longName) /* i18n-data: Test fixture. */)},
            {"billing", StatusScreen::billing(FirmwareI18n::Text::literal("12.345.678.901,23 EUR") /* i18n-data: Test fixture. */, FirmwareI18n::Text::literal(longName) /* i18n-data: Test fixture. */)},
            {"warning", StatusScreen::warning(FirmwareI18n::Message::StatusUnavailable, FirmwareI18n::Message::SignInAgainToLoadTheCurrentResourceStatus)},
            {"warning-no-button", StatusScreen::warning(FirmwareI18n::Message::TouchUnavailable, FirmwareI18n::Message::TouchPanelNotDetectedCheckHardwareAndReboot, false)},
            {"generic", StatusScreen::generic(FirmwareI18n::Message::GenericError, "RESOURCE_LOCKED_BY_ANOTHER_ADMINISTRATOR_ACCOUNT")},
        };
        for (const auto &variant : variants)
        {
            Display::showStatus(variant.second);
            Display::loop();
            assert(lv_screen_active() == Display::statusScreen.getScreen());
            expectCleanLayout(variant.first);
            lv_refr_now(nullptr);
            assert(display.pollEvents());
            screenshot(screenshots, (std::string("status-") + variant.first + "-" + language + ".png").c_str());
            ++shot;
        }
    }
    State::setDefaultLanguage("de");
    Display::loop();

    // A status screen is shown over the screen the user was on and returns to it, state intact.
    Display::transitionToScreen(&Display::resourceListScreen);
    Display::loop();
    Display::showStatus(StatusScreen::error(FirmwareI18n::Message::SignInFailed, FirmwareI18n::Message::PleaseTapAValidNfcCard));
    Display::loop();
    assert(findLabel(lv_screen_active(), "Anmeldung fehlgeschlagen"));
    assert(!findLabel(lv_layer_top(), "Anmeldung fehlgeschlagen"));
    assert(Display::resourceListScreen.isLoaded());
    lv_obj_send_event(lv_obj_get_parent(findLabel(lv_screen_active(), "OK")), LV_EVENT_CLICKED, nullptr);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());

    // The success screen has no button: a tap anywhere returns.
    Display::showStatus(StatusScreen::success(FirmwareI18n::Message::UsageEnded, FirmwareI18n::Text::literal("CNC") /* i18n-data: Test fixture. */));
    Display::loop();
    assert(!findLabel(lv_screen_active(), "OK"));
    lv_obj_send_event(lv_screen_active(), LV_EVENT_CLICKED, nullptr);
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());

    // Auto-return.
    auto timed = StatusScreen::success(FirmwareI18n::Message::UsageEnded, FirmwareI18n::Text::literal("CNC") /* i18n-data: Test fixture. */);
    timed.autoReturnMs = 120;
    Display::showStatus(std::move(timed));
    Display::loop();
    assert(lv_screen_active() == Display::statusScreen.getScreen());
    SDL_Delay(160);
    Display::loop();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());

    // Anything else that replaces it takes it away and lets the origin unload.
    Display::showStatus(longError());
    Display::loop();
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
    assert(!findLabel(lv_screen_active(), "Anmeldung fehlgeschlagen"));
    assert(!Display::statusScreen.isLoaded() && !Display::resourceListScreen.isLoaded());
    // Nothing returns to a screen that was left on purpose.
    assert(!Display::returnFromTransient());
}

void testConfirmScreen(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    Display::transitionToScreen(&Display::resourceListScreen);
    Display::loop();
    bool confirmed = false;
    for (const char *language : {"de", "en"})
    {
        State::setDefaultLanguage(language);
        Display::loop();
        ConfirmScreen::Config config;
        config.title = FirmwareI18n::Message::PowerOffDevice;
        config.message = FirmwareI18n::Message::TheReaderWillPowerOffNow;
        config.confirmLabel = FirmwareI18n::Message::PowerOff;
        config.onConfirm = [&] { confirmed = true; };
        Display::showConfirm(std::move(config));
        Display::loop();
        assert(lv_screen_active() == Display::confirmScreen.getScreen());
        expectCleanLayout("confirm");
        lv_refr_now(nullptr);
        assert(display.pollEvents());
        screenshot(screenshots, (std::string("confirm-") + language + ".png").c_str());
        if (std::string(language) == "de")
        {
            // Two equal buttons side by side, nothing confirmed by itself.
            auto *cancel = lv_obj_get_parent(findLabel(lv_screen_active(), "Abbrechen"));
            auto *confirm = lv_obj_get_parent(findLabel(lv_screen_active(), "Ausschalten"));
            assert(lv_obj_get_width(cancel) == lv_obj_get_width(confirm) && !confirmed);
            lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
            assert(lv_screen_active() == Display::resourceListScreen.getScreen() && !confirmed);
        }
    }
    lv_obj_send_event(lv_obj_get_parent(findLabel(lv_screen_active(), "Power off")), LV_EVENT_CLICKED, nullptr);
    assert(confirmed);
    State::setDefaultLanguage("de");
    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
}
