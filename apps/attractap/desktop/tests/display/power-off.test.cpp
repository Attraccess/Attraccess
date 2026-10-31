// The power button only exists on V4 hardware. Compile it into this test so the
// inline confirm runs on the host. The define is scoped to the power-off
// sources: screen classes change layout under it, so the rest must not see it.
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
    lv_obj_t *screen = lv_obj_create(nullptr);
    DisplayTheme::applyScreen(screen);
    lv_obj_set_flex_flow(screen, LV_FLEX_FLOW_COLUMN);
    lv_obj_t *button = PowerOffButton::create(screen, [&] { poweredOff = true; });
    lv_screen_load(screen);
    lv_refr_now(nullptr);

    auto *confirmLabel = findLabel(screen, "Gerät ausschalten?");
    assert(confirmLabel && !lv_obj_is_visible(confirmLabel) && lv_obj_is_visible(button));
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "power-off-confirm.png");
    // The confirm replaces the button in place; nothing lives on the top layer.
    assert(lv_obj_is_visible(confirmLabel) && !lv_obj_is_visible(button));
    assert(lv_obj_get_screen(confirmLabel) == screen);
    assert(!findLabel(lv_layer_top(), "Gerät ausschalten?"));
    expectUmlaut(confirmLabel);

    lv_obj_send_event(lv_obj_get_parent(findLabel(screen, "Abbrechen")), LV_EVENT_CLICKED, nullptr);
    assert(!lv_obj_is_visible(confirmLabel) && lv_obj_is_visible(button) && !poweredOff);

    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    lv_obj_send_event(lv_obj_get_parent(findLabel(screen, "Ausschalten")), LV_EVENT_CLICKED, nullptr);
    assert(poweredOff && lv_obj_is_visible(button));

    // Leaving the host screen resets an open confirm.
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    PowerOffButton::hideConfirm();
    assert(lv_obj_is_visible(button) && !lv_obj_is_visible(confirmLabel));

    Display::transitionToScreen(&Display::initScreen);
    Display::loop();
    lv_obj_delete(screen);
    PowerOffButton::hideConfirm(); // Safe once the host screen is gone.
}
