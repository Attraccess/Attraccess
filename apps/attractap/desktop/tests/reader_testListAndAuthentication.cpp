#include "reader_workflow.hpp"

void ReaderWorkflow::testListAndAuthentication()
{
    list(false, true);
    // Wait for the boot delay and screen animation to complete on loaded runners.
    const auto bootDeadline = millis() + 10000;
    while (lv_screen_active() != Display::resourceListScreen.getScreen() &&
           static_cast<int32_t>(bootDeadline - millis()) > 0)
        pump();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    auto *networkBadge = lv_obj_get_parent(label(lv_layer_top(), "OK NET"));
    assert(lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    setQuality(State::NETWORK_QUALITY_DEGRADED); pump();
    assert(label(lv_layer_top(), "! NET") && !lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    display.capture(output, "01a-net-degraded");
    setQuality(State::NETWORK_QUALITY_OFFLINE); pump();
    assert(label(lv_layer_top(), "x NET") && !lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    display.capture(output, "01b-net-offline");
    setQuality(State::NETWORK_QUALITY_GOOD); pump();
    assert(label(lv_layer_top(), "OK NET") && lv_obj_has_flag(networkBadge, LV_OBJ_FLAG_HIDDEN));
    auto *listName = label(lv_screen_active(), "Lasercutter");
    assert(listName);
    auto *listDescription = lv_obj_get_child(lv_obj_get_parent(listName), 1);
    assert(lv_obj_check_type(listDescription, &lv_label_class));
    assert(std::strlen(lv_label_get_text(listDescription)) < longDescription.size());
    lv_obj_update_layout(lv_screen_active());
    lv_area_t nameBounds, descriptionBounds, rowBounds;
    lv_obj_get_coords(listName, &nameBounds);
    lv_obj_get_coords(listDescription, &descriptionBounds);
    lv_obj_get_coords(lv_obj_get_parent(lv_obj_get_parent(listName)), &rowBounds);
    assert(nameBounds.y2 < descriptionBounds.y1);
    assert(descriptionBounds.y2 <= rowBounds.y2);
    assert(lv_obj_get_height(listDescription) <= 20);
    display.capture(output, "01-single-resource-list");
    list(false);
    // A drawer opened before scanning must close as soon as authentication begins.
    display.touch = {240, 10, true}; pump();
    display.touch = {240, 140, true}; pump();
    display.touch.pressed = false; pump();
    assert(lv_obj_is_visible(label(lv_layer_top(), "Maintenance")));
    drawerSettingsBeforeLogin = lv_obj_get_parent(label(lv_layer_top(), "Settings"));
    login();
    assert(lv_screen_active() == Display::resourceListScreen.getScreen());
    assert(label(lv_screen_active(), "Alex"));
    display.capture(output, "02-scan-first-list");
}
