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

namespace
{
    bool inside(const lv_area_t &inner, const lv_area_t &outer)
    {
        return inner.x1 >= outer.x1 && inner.x2 <= outer.x2 && inner.y1 >= outer.y1 && inner.y2 <= outer.y2;
    }

    // Leave a raw test root the way production does: through the router.
    void leave(lv_obj_t *root)
    {
        Display::transitionToScreen(&Display::initScreen);
        Display::loop();
        lv_obj_delete(root);
    }
}

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
    // The question has its own line; Cancel and Power off sit below it.
    auto *cancel = lv_obj_get_parent(findLabel(screen, "Abbrechen"));
    auto *powerOff = lv_obj_get_parent(findLabel(screen, "Ausschalten"));
    assert(coordsOf(confirmLabel).y2 < coordsOf(cancel).y1 && coordsOf(confirmLabel).y2 < coordsOf(powerOff).y1);
    assert(coordsOf(cancel).x2 < coordsOf(powerOff).x1);
    // Captions fit their content-sized buttons.
    assert(inside(coordsOf(findLabel(screen, "Ausschalten")), coordsOf(powerOff)));

    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    assert(!lv_obj_is_visible(confirmLabel) && lv_obj_is_visible(button) && !poweredOff);

    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    lv_obj_send_event(powerOff, LV_EVENT_CLICKED, nullptr);
    assert(poweredOff && lv_obj_is_visible(button));

    // Leaving the host screen resets an open confirm.
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    PowerOffButton::hideConfirm(button);
    assert(lv_obj_is_visible(button) && !lv_obj_is_visible(confirmLabel));
    PowerOffButton::hideConfirm(nullptr); // A screen without a button yet.

    // Every button is on its own: while one host screen waits for its deferred
    // destroy another one with a button exists. Deleting it must not break this one.
    lv_obj_t *other = lv_obj_create(nullptr);
    bool otherPoweredOff = false;
    lv_obj_t *otherButton = PowerOffButton::create(other, [&] { otherPoweredOff = true; });
    lv_obj_send_event(otherButton, LV_EVENT_CLICKED, nullptr);
    assert(lv_obj_is_visible(confirmLabel) == false);
    lv_obj_delete(other);
    poweredOff = false;
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    assert(lv_obj_is_visible(confirmLabel) && !lv_obj_is_visible(button));
    lv_obj_send_event(powerOff, LV_EVENT_CLICKED, nullptr);
    assert(poweredOff && !otherPoweredOff && lv_obj_is_visible(button));
    leave(screen);

    // Regression: beside another action (demo settings) the confirm used to overflow the row and push the
    // sibling and its own caption off-screen. It takes its own full-width line inside the host.
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
    lv_refr_now(nullptr);
    assert(display.pollEvents());
    screenshot(screenshots, "power-off-confirm-crowded.png");
    const lv_area_t rowArea = coordsOf(row);
    assert(inside(coordsOf(sibling), rowArea));
    assert(inside(coordsOf(findLabel(host, "Gerät ausschalten?")), rowArea));
    assert(inside(coordsOf(lv_obj_get_parent(findLabel(host, "Abbrechen"))), rowArea));
    assert(inside(coordsOf(lv_obj_get_parent(findLabel(host, "Ausschalten"))), rowArea));
    assert(coordsOf(sibling).y2 < coordsOf(findLabel(host, "Gerät ausschalten?")).y1);
    PowerOffButton::hideConfirm(crowdedButton);
    leave(host);
}
