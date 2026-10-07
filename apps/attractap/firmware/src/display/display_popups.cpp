#include "display.hpp"
#include "display/theme.hpp"
#include "fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <cstdlib>

// Global overlay popups rendered on the LVGL top layer: a generic error dialog
// and an insufficient-balance top-up dialog. Both replace any active popup and
// store the overlay in Display::activePopup so hidePopup can tear it down.

void Display::showErrorPopup(const std::string &title, const std::string &message)
{
    Display::showMessagePopup(title, message, true);
}

void Display::showBillingSummary(const std::string &total)
{
    Display::showMessagePopup("Gesamtkosten dieser Sitzung", total, false);
}

void Display::showMessagePopup(const std::string &title, const std::string &message, bool error)
{
    // Close existing popup if any
    Display::hidePopup();
    if (Display::popupAutoCloseTimer)
    {
        lv_timer_del(Display::popupAutoCloseTimer);
        Display::popupAutoCloseTimer = nullptr;
    }

    lv_obj_t *top = lv_layer_top();
    lv_obj_t *overlay = lv_obj_create(top);
    lv_obj_remove_style_all(overlay);
    lv_obj_set_size(overlay, lv_pct(100), lv_pct(100));
    lv_obj_set_align(overlay, LV_ALIGN_CENTER);
    lv_obj_set_style_bg_color(overlay, lv_color_black(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(overlay, 160, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_remove_flag(overlay, LV_OBJ_FLAG_SCROLLABLE);

    // Dialog container
    lv_obj_t *dialog = lv_obj_create(overlay);
    lv_obj_remove_style_all(dialog);
    lv_obj_set_width(dialog, lv_pct(80));
    lv_obj_set_height(dialog, LV_SIZE_CONTENT);
    lv_obj_set_align(dialog, LV_ALIGN_CENTER);
    DisplayTheme::applySurface(dialog);
    lv_obj_set_style_pad_left(dialog, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(dialog, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_top(dialog, 16, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_bottom(dialog, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_flex_flow(dialog, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(dialog, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);

    // Title
    lv_obj_t *titleLbl = lv_label_create(dialog);
    lv_label_set_text(titleLbl, title.c_str());
    lv_obj_set_width(titleLbl, lv_pct(100));
    lv_obj_set_style_text_color(titleLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(titleLbl, &attractap_font_montserrat_latin1_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    // Message
    lv_obj_t *msgLbl = lv_label_create(dialog);
    lv_label_set_text(msgLbl, message.c_str());
    lv_obj_set_style_text_color(msgLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(msgLbl, error ? &attractap_font_montserrat_latin1_14 : &attractap_font_montserrat_latin1_24, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_width(msgLbl, lv_pct(100));

    // Footer with OK button
    lv_obj_t *footer = lv_obj_create(dialog);
    lv_obj_remove_style_all(footer);
    lv_obj_set_width(footer, lv_pct(100));
    lv_obj_set_height(footer, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);

    lv_obj_t *okBtn = lv_button_create(footer);
    lv_obj_set_height(okBtn, LV_SIZE_CONTENT);
    lv_obj_set_width(okBtn, LV_SIZE_CONTENT);
    DisplayTheme::button(okBtn, error ? DisplayTheme::danger() : DisplayTheme::primary());

    lv_obj_t *okLbl = lv_label_create(okBtn);
    lv_label_set_text(okLbl, "OK");

    lv_obj_add_event_cb(okBtn, [](lv_event_t *e)
                        {
        if (lv_event_get_code(e) == LV_EVENT_CLICKED)
        {
            Display::hidePopup();
        } }, LV_EVENT_CLICKED, NULL);

    Display::activePopup = overlay;
}


void Display::hidePopup()
{
    if (Display::activePopup)
    {
        lv_obj_del(Display::activePopup);
        Display::activePopup = nullptr;
    }
    if (Display::popupAutoCloseTimer)
    {
        lv_timer_del(Display::popupAutoCloseTimer);
        Display::popupAutoCloseTimer = nullptr;
    }
}
