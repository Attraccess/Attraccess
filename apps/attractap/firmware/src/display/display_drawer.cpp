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
                         if (lv_event_get_code(e) != LV_EVENT_CLICKED)
                             return;
                         Display::logger.info("Drawer: open settings requested");
                         Display::closeDrawer();
                         if (Display::onOpenSettingsCallback)
                             Display::onOpenSettingsCallback();
                     });

    makeDrawerButton(row, LV_SYMBOL_POWER, "Reboot", DisplayTheme::danger(),
                     [](lv_event_t *e)
                     {
                         if (lv_event_get_code(e) != LV_EVENT_CLICKED)
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

void Display::showRebootConfirm()
{
    lv_obj_t *top = lv_layer_top();
    lv_obj_t *overlay = lv_obj_create(top);
    lv_obj_remove_style_all(overlay);
    lv_obj_set_size(overlay, lv_pct(100), lv_pct(100));
    lv_obj_set_align(overlay, LV_ALIGN_CENTER);
    lv_obj_set_style_bg_color(overlay, lv_color_black(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(overlay, 160, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_remove_flag(overlay, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(overlay, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t *dialog = lv_obj_create(overlay);
    lv_obj_remove_style_all(dialog);
    lv_obj_set_width(dialog, lv_pct(80));
    lv_obj_set_height(dialog, LV_SIZE_CONTENT);
    lv_obj_set_align(dialog, LV_ALIGN_CENTER);
    DisplayTheme::applySurface(dialog);
    lv_obj_set_style_pad_all(dialog, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_row(dialog, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_flex_flow(dialog, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(dialog, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);

    lv_obj_t *titleLbl = lv_label_create(dialog);
    lv_label_set_text(titleLbl, "Reboot device?");
    lv_obj_set_style_text_color(titleLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(titleLbl, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *msgLbl = lv_label_create(dialog);
    lv_label_set_text(msgLbl, "The reader will restart now.");
    lv_obj_set_style_text_color(msgLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(msgLbl, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_width(msgLbl, lv_pct(100));

    lv_obj_t *footer = lv_obj_create(dialog);
    lv_obj_remove_style_all(footer);
    lv_obj_set_width(footer, lv_pct(100));
    lv_obj_set_height(footer, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);
    lv_obj_set_style_pad_column(footer, 10, LV_PART_MAIN | LV_STATE_DEFAULT);

    lv_obj_t *cancelBtn = lv_button_create(footer);
    lv_obj_set_height(cancelBtn, LV_SIZE_CONTENT);
    lv_obj_set_width(cancelBtn, LV_SIZE_CONTENT);
    DisplayTheme::secondaryButton(cancelBtn);
    lv_obj_t *cancelLbl = lv_label_create(cancelBtn);
    lv_label_set_text(cancelLbl, "Cancel");
    lv_obj_add_event_cb(cancelBtn, [](lv_event_t *e)
                        {
        if (lv_event_get_code(e) != LV_EVENT_CLICKED)
            return;
        lv_obj_t *ov = (lv_obj_t *)lv_event_get_user_data(e);
        if (ov)
            lv_obj_del(ov); }, LV_EVENT_CLICKED, overlay);

    lv_obj_t *rebootBtn = lv_button_create(footer);
    lv_obj_set_height(rebootBtn, LV_SIZE_CONTENT);
    lv_obj_set_width(rebootBtn, LV_SIZE_CONTENT);
    DisplayTheme::button(rebootBtn, DisplayTheme::danger());
    lv_obj_t *rebootLbl = lv_label_create(rebootBtn);
    lv_label_set_text(rebootLbl, "Reboot");
    lv_obj_add_event_cb(rebootBtn, [](lv_event_t *e)
                        {
        if (lv_event_get_code(e) != LV_EVENT_CLICKED)
            return;
        Display::logger.info("Drawer: reboot confirmed, restarting");
        esp_restart(); }, LV_EVENT_CLICKED, NULL);
}

void Display::handleGestureSample(int16_t x, int16_t y, bool pressed)
{
    (void)x;

#ifdef HAS_POWER_BUTTON
    // The power-off confirm modal also lives on the top layer, above the drawer.
    // This gesture is not LVGL hit-tested, so without this check a top-edge
    // swipe would open the drawer behind the modal, completely invisibly.
    if (PowerOffButton::isConfirmVisible())
    {
        Display::gesturePrevPressed = pressed;
        Display::gestureCandidate = false;
        return;
    }
#endif

    if (!pressed)
    {
        Display::gesturePrevPressed = false;
        Display::gestureCandidate = false;
        return;
    }

    if (!Display::gesturePrevPressed)
    {
        // Rising edge: a new touch just started. It only counts as a drawer
        // gesture if it began inside the top edge band and the drawer is closed.
        Display::gesturePrevPressed = true;
        Display::gestureStartY = y;
        Display::gestureCandidate = !Display::drawerOpen && (y <= DRAWER_EDGE_BAND_PX);
        return;
    }

    if (Display::gestureCandidate && !Display::drawerOpen &&
        ((int)y - (int)Display::gestureStartY) >= DRAWER_OPEN_THRESHOLD_PX)
    {
        Display::gestureCandidate = false;
        Display::openDrawer();
    }
}
