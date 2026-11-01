// The power button only exists on V4 hardware. Compile it into this test so the
// confirmation runs on the host. The define is scoped to the power-off sources:
// screen classes change layout under it, so the rest must not see it.
#define HAS_POWER_BUTTON 1
#include "display/shared/powerOff/powerOffButton.hpp"
#undef HAS_POWER_BUTTON
#include "fixtures.hpp"
#define HAS_POWER_BUTTON 1
#include "display/shared/powerOff/powerOffButton.cpp"
#undef HAS_POWER_BUTTON

void testPowerOffConfirm(SdlDisplay &display, const std::filesystem::path &screenshots)
{
    bool poweredOff = false;
    PowerOffButton::setConfirmPresenter([](ConfirmScreen::Config config) { Display::showConfirm(std::move(config)); },
                                        [] { Display::returnFromTransient(); });
    // A host screen with tabs-like state: the confirmation must hand it back as it was.
    lv_obj_t *host = lv_obj_create(nullptr);
    DisplayTheme::applyScreen(host);
    lv_obj_set_flex_flow(host, LV_FLEX_FLOW_COLUMN);
    lv_obj_t *marker = lv_label_create(host);
    lv_label_set_text(marker, "Tab: Gerät");
    lv_obj_t *button = PowerOffButton::create(host, [&] { poweredOff = true; });
    lv_screen_load(host);
    struct HostScreen : IScreen
    {
        lv_obj_t *root;
        explicit HostScreen(lv_obj_t *root) : root(root) {}
        void init() override {}
        void onScreenLeave() override {}
        void loop() override {}
        std::string getName() override { return "PowerOffHost"; }
        lv_obj_t *getScreen() override { return root; }
        bool shouldAutoUnload() const override { return true; }
    } hostScreen(host);
    Display::transitionToScreen(&hostScreen);
    Display::loop();

    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    assert(lv_screen_active() == Display::confirmScreen.getScreen());
    assert(findLabel(lv_screen_active(), "Gerät ausschalten?"));
    assert(!findLabel(lv_layer_top(), "Gerät ausschalten?"));
    expectUmlaut(findLabel(lv_screen_active(), "Gerät ausschalten?"));
    expectCleanLayout("power-off confirm");
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "power-off-confirm.png");

    // Cancel returns to the host screen with its state intact.
    lv_obj_send_event(lv_obj_get_parent(findLabel(lv_screen_active(), "Abbrechen")), LV_EVENT_CLICKED, nullptr);
    assert(lv_screen_active() == host && findLabel(host, "Tab: Gerät") == marker && !poweredOff);

    // Confirming powers off through the callback, then hands the screen back too.
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    lv_obj_send_event(lv_obj_get_parent(findLabel(lv_screen_active(), "Ausschalten")), LV_EVENT_CLICKED, nullptr);
    assert(poweredOff && lv_screen_active() == host);

    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
    lv_obj_delete(host);
}
