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

    // Regression: beside another action (demo settings) the confirm used to overflow the row and push the
    // sibling and its own caption off-screen. It must wrap onto its own line inside the host.
    lv_obj_t *host = lv_obj_create(nullptr);
    DisplayTheme::applyScreen(host);
    lv_obj_t *row = lv_obj_create(host);
    lv_obj_remove_style_all(row);
    lv_obj_set_size(row, 440, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW_WRAP);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_t *sibling = lv_button_create(row);
    lv_obj_set_size(sibling, 160, 40);
    lv_obj_t *crowdedButton = PowerOffButton::create(row, [] {});
    lv_screen_load(host);
    lv_obj_send_event(crowdedButton, LV_EVENT_CLICKED, nullptr);
    lv_obj_update_layout(host);
    lv_area_t rowArea, siblingArea, labelArea, confirmArea;
    lv_obj_get_coords(row, &rowArea);
    lv_obj_get_coords(sibling, &siblingArea);
    auto *crowdedLabel = findLabel(host, "Gerät ausschalten?");
    lv_obj_get_coords(crowdedLabel, &labelArea);
    lv_obj_get_coords(lv_obj_get_parent(findLabel(host, "Ausschalten")), &confirmArea);
    assert(siblingArea.x1 >= rowArea.x1 && siblingArea.x2 <= rowArea.x2);
    assert(labelArea.x1 >= rowArea.x1 && confirmArea.x2 <= rowArea.x2);
    PowerOffButton::hideConfirm();
    lv_screen_load(lv_obj_create(nullptr));
    lv_obj_delete(host);
    PowerOffButton::hideConfirm();
}
