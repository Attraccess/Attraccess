#include "display.hpp"
#include "display/theme.hpp"
#include <string>
#include <functional>
#include <cstdlib>

// Global overlay popups rendered on the LVGL top layer: a generic error dialog
// and an insufficient-balance top-up dialog. Both replace any active popup and
// store the overlay in Display::activePopup so hidePopup can tear it down.

void Display::showErrorPopup(const std::string &title, const std::string &message)
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
    lv_obj_set_style_text_color(titleLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(titleLbl, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    // Message
    lv_obj_t *msgLbl = lv_label_create(dialog);
    lv_label_set_text(msgLbl, message.c_str());
    lv_obj_set_style_text_color(msgLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(msgLbl, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
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
    DisplayTheme::button(okBtn, DisplayTheme::danger());

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

void Display::showInsufficientBalancePopup(std::function<void(uint32_t amountCents)> onStart, std::function<void()> onCancel)
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
    lv_label_set_text(titleLbl, "Unzureichendes Guthaben");
    lv_obj_set_style_text_color(titleLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(titleLbl, &lv_font_montserrat_18, LV_PART_MAIN | LV_STATE_DEFAULT);

    // Message
    lv_obj_t *msgLbl = lv_label_create(dialog);
    lv_label_set_text(msgLbl, "Ihr Guthaben reicht nicht aus, um die Aktion auszuführen. Bitte laden Sie Ihr Guthaben auf.");
    lv_obj_set_style_text_color(msgLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(msgLbl, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_width(msgLbl, lv_pct(100));

    // Amount label
    lv_obj_t *amountLbl = lv_label_create(dialog);
    lv_label_set_text(amountLbl, "Betrag (EUR)");
    lv_obj_set_style_text_color(amountLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(amountLbl, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);

    // Amount input
    lv_obj_t *amountTa = lv_textarea_create(dialog);
    lv_textarea_set_one_line(amountTa, true);
    lv_textarea_set_max_length(amountTa, 6); // e.g., up to 999999
    lv_textarea_set_accepted_chars(amountTa, "0123456789");
    lv_obj_set_width(amountTa, lv_pct(100));
    DisplayTheme::field(amountTa);
    lv_obj_set_style_pad_left(amountTa, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(amountTa, 8, LV_PART_MAIN | LV_STATE_DEFAULT);

    // Inline error label (initially empty)
    lv_obj_t *errorLbl = lv_label_create(dialog);
    lv_label_set_text(errorLbl, "");
    lv_obj_set_style_text_color(errorLbl, DisplayTheme::danger(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_text_font(errorLbl, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);

    // Footer with buttons
    lv_obj_t *footer = lv_obj_create(dialog);
    lv_obj_remove_style_all(footer);
    lv_obj_set_width(footer, lv_pct(100));
    lv_obj_set_height(footer, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_START);

    // Context to carry callbacks into LVGL C callbacks
    struct InsufficientBalancePopupCtx
    {
        std::function<void(uint32_t)> onStart;
        std::function<void()> onCancel;
        lv_obj_t *dialog;
        lv_obj_t *amountTa;
        lv_obj_t *errorLbl;
        lv_obj_t *keyboard;
    };
    InsufficientBalancePopupCtx *ctx = new InsufficientBalancePopupCtx{onStart, onCancel, dialog, amountTa, errorLbl, nullptr};
    // Ensure context is freed when popup is destroyed (covers all close paths)
    lv_obj_add_event_cb(overlay, [](lv_event_t *e)
                        {
        if (lv_event_get_code(e) != LV_EVENT_DELETE) return;
        auto *c = (InsufficientBalancePopupCtx*)lv_event_get_user_data(e);
        delete c; }, LV_EVENT_DELETE, ctx);

    // On-screen keyboard (hidden by default)
    lv_obj_t *keyboard = lv_keyboard_create(overlay);
    DisplayTheme::keyboard(keyboard);
    lv_obj_set_width(keyboard, lv_pct(100));
    lv_obj_set_align(keyboard, LV_ALIGN_BOTTOM_MID);
    lv_keyboard_set_mode(keyboard, LV_KEYBOARD_MODE_NUMBER);
    lv_keyboard_set_textarea(keyboard, amountTa);
    lv_obj_add_flag(keyboard, LV_OBJ_FLAG_HIDDEN);
    ctx->keyboard = keyboard;

    // Show keyboard when amount field is clicked/focused
    lv_obj_add_event_cb(amountTa, [](lv_event_t *e)
                        {
        if (lv_event_get_code(e) != LV_EVENT_CLICKED && lv_event_get_code(e) != LV_EVENT_FOCUSED) return;
        auto *c = (InsufficientBalancePopupCtx*)lv_event_get_user_data(e);
        if (!c || !c->keyboard) return;
        lv_obj_clear_flag(c->keyboard, LV_OBJ_FLAG_HIDDEN);
        if (c->dialog) {
            lv_obj_set_align(c->dialog, LV_ALIGN_TOP_MID);
            lv_obj_set_y(c->dialog, 8);
        } }, LV_EVENT_ALL, ctx);

    // Hide keyboard on ready/cancel
    lv_obj_add_event_cb(keyboard, [](lv_event_t *e)
                        {
        auto code = lv_event_get_code(e);
        if (code != LV_EVENT_READY && code != LV_EVENT_CANCEL) return;
        lv_obj_t *kb = (lv_obj_t*)lv_event_get_target(e);
        auto *c = (InsufficientBalancePopupCtx*)lv_event_get_user_data(e);
        if (c && c->dialog) {
            lv_obj_set_align(c->dialog, LV_ALIGN_CENTER);
            lv_obj_set_y(c->dialog, 0);
        }
        lv_obj_add_flag(kb, LV_OBJ_FLAG_HIDDEN); }, LV_EVENT_ALL, ctx);

    // Cancel button
    lv_obj_t *cancelBtn = lv_button_create(footer);
    lv_obj_set_height(cancelBtn, LV_SIZE_CONTENT);
    lv_obj_set_width(cancelBtn, LV_SIZE_CONTENT);
    DisplayTheme::secondaryButton(cancelBtn);
    lv_obj_t *cancelLbl = lv_label_create(cancelBtn);
    lv_label_set_text(cancelLbl, "Abbrechen");

    // Start button
    lv_obj_t *startBtn = lv_button_create(footer);
    lv_obj_set_height(startBtn, LV_SIZE_CONTENT);
    lv_obj_set_width(startBtn, LV_SIZE_CONTENT);
    DisplayTheme::button(startBtn);
    lv_obj_t *startLbl = lv_label_create(startBtn);
    lv_label_set_text(startLbl, "Aufladen");

    // Handlers
    lv_obj_add_event_cb(cancelBtn, [](lv_event_t *e)
                        {
        if (lv_event_get_code(e) == LV_EVENT_CLICKED) {
            auto *c = (InsufficientBalancePopupCtx*)lv_event_get_user_data(e);
            if (c && c->onCancel) c->onCancel();
            Display::hidePopup();
        } }, LV_EVENT_CLICKED, ctx);

    lv_obj_add_event_cb(startBtn, [](lv_event_t *e)
                        {
        if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
        auto *c = (InsufficientBalancePopupCtx*)lv_event_get_user_data(e);
        if (!c) return;
        // Validate amount
        const char *txt = lv_textarea_get_text(c->amountTa);
        bool hasDigits = false;
        for (const char *p = txt; p && *p; ++p) { if (*p >= '0' && *p <= '9') { hasDigits = true; break; } }
        if (!hasDigits) {
            lv_label_set_text(c->errorLbl, "Bitte Betrag eingeben.");
            return;
        }
        long euros = strtol(txt, NULL, 10);
        if (euros <= 0) {
            lv_label_set_text(c->errorLbl, "Bitte gültigen Betrag eingeben.");
            return;
        }
        uint32_t amountCents = (uint32_t)(euros * 100);

        // Hide keyboard if visible
        if (c->keyboard) lv_obj_add_flag(c->keyboard, LV_OBJ_FLAG_HIDDEN);

        // Replace dialog contents with brief instruction then close shortly
        lv_obj_t *footer = lv_obj_get_parent((lv_obj_t *)lv_event_get_target(e));
        lv_obj_t *dialog = lv_obj_get_parent(footer);
        lv_obj_clean(dialog);
        lv_obj_t *infoLbl = lv_label_create(dialog);
        lv_label_set_text(infoLbl, "Bitte am Zahlungsterminal fortfahren …");
        lv_obj_set_style_text_color(infoLbl, DisplayTheme::text(), LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_text_font(infoLbl, &lv_font_montserrat_14, LV_PART_MAIN | LV_STATE_DEFAULT);

        if (c->onStart) c->onStart(amountCents);
        // Close after short delay
        Display::popupAutoCloseTimer = lv_timer_create([](lv_timer_t *tmr){ (void)tmr; Display::hidePopup(); Display::popupAutoCloseTimer = nullptr; }, 1200, NULL);
        (void)Display::popupAutoCloseTimer; }, LV_EVENT_CLICKED, ctx);

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
