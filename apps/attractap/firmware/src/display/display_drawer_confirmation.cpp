#include "display.hpp"
#include "display/theme.hpp"
#include <functional>
#include "shared/powerOff/powerOffButton.hpp"

namespace { constexpr int16_t DRAWER_EDGE_BAND_PX = 45; constexpr int16_t DRAWER_OPEN_THRESHOLD_PX = 90; }
void Display::showRebootConfirm()
{
    if (!Display::isDrawerAvailable() || Display::rebootConfirmOverlay)
        return;
    lv_obj_t *top = lv_layer_top();
    lv_obj_t *overlay = lv_obj_create(top);
    Display::rebootConfirmOverlay = overlay;
    lv_obj_add_event_cb(overlay, [](lv_event_t *) { Display::rebootConfirmOverlay = nullptr; }, LV_EVENT_DELETE, nullptr);
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
        if (lv_event_get_code(e) != LV_EVENT_CLICKED || !Display::isDrawerAvailable())
            return;
        Display::logger.info("Drawer: reboot confirmed, restarting");
#ifndef ATTRACTAP_HOST
        esp_restart();
#endif
    }, LV_EVENT_CLICKED, NULL);
}
