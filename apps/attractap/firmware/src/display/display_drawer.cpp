#include "display.hpp"
#include "display/theme.hpp"
#include <functional>
#include "shared/powerOff/powerOffButton.hpp"

// Hidden maintenance drawer rendered on the LVGL top layer. It is revealed by a
// pull-down gesture that starts at the very top edge of the screen and drags
// downward (see handleGestureSample). The drawer exposes two admin actions:
//   - "Settings": delegated to the application via onOpenSettingsCallback
//                 (same path as the init screen's settings entry, incl. PIN lock)
//   - "Reboot":   shows a confirmation, then esp_restart()
//
// Gesture detection is passive: it observes touch samples forwarded from
// touchpad_read and never consumes them, so the active screen still receives
// every touch normally. Only a deliberate top-edge downward drag opens the
// drawer, which keeps it out of the way of regular screen interactions.

namespace
{
    // Pull-down gesture tuning.
    constexpr int16_t DRAWER_EDGE_BAND_PX = 45;       // press must start within this top band
    constexpr int16_t DRAWER_OPEN_THRESHOLD_PX = 90;  // and drag down at least this far
    constexpr int32_t DRAWER_HEIGHT = 230;            // panel height / off-screen offset

    lv_obj_t *makeDrawerButton(lv_obj_t *parent, const char *symbol, const char *text,
                               lv_color_t color, lv_event_cb_t cb)
    {
        lv_obj_t *btn = lv_button_create(parent);
        lv_obj_set_size(btn, lv_pct(44), 110);
        DisplayTheme::button(btn, color);
        lv_obj_set_flex_flow(btn, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(btn, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_row(btn, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

        lv_obj_t *icon = lv_label_create(btn);
        lv_label_set_text(icon, symbol);
        lv_obj_set_style_text_font(icon, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

        lv_obj_t *lbl = lv_label_create(btn);
        lv_label_set_text(lbl, text);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);

        lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, NULL);
        return btn;
    }
}

void Display::setOnOpenSettingsCallback(std::function<void()> callback)
{
    Display::onOpenSettingsCallback = callback;
}

void Display::setDrawerAvailableCallback(std::function<bool()> callback)
{
    Display::drawerAvailableCallback = std::move(callback);
}

bool Display::isDrawerAvailable()
{
    return !Display::drawerAvailableCallback || Display::drawerAvailableCallback();
}

void Display::updateDrawerAvailability()
{
    if (Display::isDrawerAvailable())
        return;
    Display::closeDrawer();
    if (Display::rebootConfirmOverlay)
        lv_obj_delete(Display::rebootConfirmOverlay);
}

void Display::initDrawer()
{
    lv_obj_t *top = lv_layer_top();

    // Dimming backdrop (created first so the panel renders above it). Hidden
    // until the drawer opens; tapping it closes the drawer.
    Display::drawerBackdrop = lv_obj_create(top);
    lv_obj_remove_style_all(Display::drawerBackdrop);
    lv_obj_set_size(Display::drawerBackdrop, lv_pct(100), lv_pct(100));
    lv_obj_set_align(Display::drawerBackdrop, LV_ALIGN_CENTER);
    lv_obj_set_style_bg_color(Display::drawerBackdrop, lv_color_black(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(Display::drawerBackdrop, 140, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_remove_flag(Display::drawerBackdrop, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(Display::drawerBackdrop, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(Display::drawerBackdrop, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_event_cb(Display::drawerBackdrop, [](lv_event_t *e)
                        {
        if (lv_event_get_code(e) == LV_EVENT_CLICKED)
        {
            Display::closeDrawer();
        } }, LV_EVENT_CLICKED, NULL);

    // Sliding panel, parked off-screen above the top edge.
    Display::drawerPanel = lv_obj_create(top);
    lv_obj_remove_style_all(Display::drawerPanel);
    lv_obj_set_width(Display::drawerPanel, lv_pct(100));
    lv_obj_set_height(Display::drawerPanel, DRAWER_HEIGHT);
    lv_obj_set_align(Display::drawerPanel, LV_ALIGN_TOP_MID);
    lv_obj_set_y(Display::drawerPanel, -DRAWER_HEIGHT);
    DisplayTheme::applySurface(Display::drawerPanel);
    lv_obj_set_style_border_width(Display::drawerPanel, 0, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_all(Display::drawerPanel, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_row(Display::drawerPanel, 14, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_flex_flow(Display::drawerPanel, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(Display::drawerPanel, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_remove_flag(Display::drawerPanel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(Display::drawerPanel, LV_OBJ_FLAG_HIDDEN);

    lv_obj_t *titleLbl = lv_label_create(Display::drawerPanel);
    lv_label_set_text(titleLbl, "Maintenance");
    lv_obj_set_style_text_color(titleLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(titleLbl, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *row = lv_obj_create(Display::drawerPanel);
    lv_obj_remove_style_all(row);
    lv_obj_set_width(row, lv_pct(100));
    lv_obj_set_height(row, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);

    makeDrawerButton(row, LV_SYMBOL_SETTINGS, "Settings", DisplayTheme::primary(),
                     [](lv_event_t *e)
                     {
                         if (lv_event_get_code(e) != LV_EVENT_CLICKED || !Display::isDrawerAvailable())
                             return;
                         Display::logger.info("Drawer: open settings requested");
                         Display::closeDrawer();
                         if (Display::onOpenSettingsCallback)
                             Display::onOpenSettingsCallback();
                     });

    makeDrawerButton(row, LV_SYMBOL_POWER, "Reboot", DisplayTheme::danger(),
                     [](lv_event_t *e)
                     {
                         if (lv_event_get_code(e) != LV_EVENT_CLICKED || !Display::isDrawerAvailable())
                             return;
                         Display::closeDrawer();
                         Display::showRebootConfirm();
                     });

    // Subtle top-edge grabber as an affordance for the otherwise hidden gesture.
    lv_obj_t *grabber = lv_obj_create(top);
    lv_obj_remove_style_all(grabber);
    lv_obj_set_size(grabber, 46, 5);
    lv_obj_set_align(grabber, LV_ALIGN_TOP_MID);
    lv_obj_set_y(grabber, 4);
    lv_obj_set_style_radius(grabber, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(grabber, DisplayTheme::muted(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(grabber, 60, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_remove_flag(grabber, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(grabber, LV_OBJ_FLAG_SCROLLABLE);
}

void Display::openDrawer()
{
    if (Display::drawerOpen || !Display::drawerPanel || !Display::drawerBackdrop)
        return;
    // This passive gesture bypasses LVGL hit testing and screen overlays.
    if (!Display::isDrawerAvailable())
        return;

    Display::drawerOpen = true;
    Display::logger.info("Maintenance drawer opened (top-edge pull-down)");
    lv_obj_remove_flag(Display::drawerBackdrop, LV_OBJ_FLAG_HIDDEN);
    lv_obj_remove_flag(Display::drawerPanel, LV_OBJ_FLAG_HIDDEN);

    // Instant open (no slide): each animation frame re-renders the moving
    // panel + the revealed screen area beneath on the software renderer,
    // which reads as rebuild flicker (PERFORMANCE_ANALYSIS.md A-3, measured
    // on hardware). A single direct placement renders one frame.
    lv_obj_set_y(Display::drawerPanel, 0);
}

void Display::closeDrawer()
{
    if (!Display::drawerOpen || !Display::drawerPanel || !Display::drawerBackdrop)
        return;

    Display::drawerOpen = false;
    lv_obj_add_flag(Display::drawerBackdrop, LV_OBJ_FLAG_HIDDEN);

    // Instant close (no slide) — see openDrawer: avoids per-frame re-render
    // flicker on the software renderer.
    lv_obj_set_y(Display::drawerPanel, -DRAWER_HEIGHT);
    lv_obj_add_flag(Display::drawerPanel, LV_OBJ_FLAG_HIDDEN);
}
