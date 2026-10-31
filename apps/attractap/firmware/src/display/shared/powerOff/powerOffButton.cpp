#include "display/i18n.hpp"
#ifdef HAS_POWER_BUTTON

#include "powerOffButton.hpp"
#include "../../theme.hpp"
#include "../../fonts/attractap_fonts.hpp"

namespace
{
    std::function<void()> g_onConfirm;
    lv_obj_t *g_button = nullptr;
    lv_obj_t *g_confirm = nullptr;

    lv_obj_t *makeButton(lv_obj_t *parent, lv_color_t color, const FirmwareI18n::Text &text, lv_event_cb_t cb,
                         const char *symbol = nullptr)
    {
        lv_obj_t *btn = lv_button_create(parent);
        DisplayTheme::button(btn, color);
        lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, nullptr);

        if (symbol)
        {
            lv_obj_set_flex_flow(btn, LV_FLEX_FLOW_ROW);
            lv_obj_set_flex_align(btn, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
            lv_obj_set_style_pad_column(btn, 8, LV_PART_MAIN);
            lv_obj_t *icon = lv_label_create(btn);
            FirmwareI18n::setDynamicLabel(icon, symbol) /* i18n-data: Language-neutral LVGL icon glyph, separate from the localized action caption. */;
            lv_obj_set_style_text_font(icon, &lv_font_montserrat_20, LV_PART_MAIN);
        }

        lv_obj_t *lbl = lv_label_create(btn);
        FirmwareI18n::setLabel(lbl, text);
        lv_obj_set_align(lbl, LV_ALIGN_CENTER);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_20, LV_PART_MAIN);
        return btn;
    }

    void onCancel(lv_event_t *)
    {
        PowerOffButton::hideConfirm();
    }

    void onConfirm(lv_event_t *)
    {
        if (g_onConfirm)
        {
            g_onConfirm(); // cuts SYS_EN — board powers down if on battery
        }
        // On battery the board is already dead here; on USB/DC power SYS_EN has
        // no effect, so restore the button instead of leaving the UI stuck.
        PowerOffButton::hideConfirm();
    }

    void onPowerBtn(lv_event_t *)
    {
        if (!g_button || !g_confirm)
        {
            return;
        }
        lv_obj_add_flag(g_button, LV_OBJ_FLAG_HIDDEN);
        lv_obj_remove_flag(g_confirm, LV_OBJ_FLAG_HIDDEN);
    }

    void onObjectDelete(lv_event_t *e)
    {
        lv_obj_t *deleted = static_cast<lv_obj_t *>(lv_event_get_target(e));
        if (deleted == g_button)
        {
            g_button = nullptr;
        }
        if (deleted == g_confirm)
        {
            g_confirm = nullptr;
        }
    }

    // Replaces the power button in place, in the screen that hosts it.
    lv_obj_t *createConfirm(lv_obj_t *parent)
    {
        lv_obj_t *confirm = lv_obj_create(parent);
        lv_obj_remove_style_all(confirm);
        lv_obj_remove_flag(confirm, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_size(confirm, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        lv_obj_set_flex_flow(confirm, LV_FLEX_FLOW_ROW_WRAP);
        lv_obj_set_flex_align(confirm, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_column(confirm, 12, LV_PART_MAIN);
        lv_obj_set_style_pad_row(confirm, 8, LV_PART_MAIN);
        lv_obj_add_flag(confirm, LV_OBJ_FLAG_HIDDEN);

        lv_obj_t *lbl = lv_label_create(confirm);
        FirmwareI18n::setLabel(lbl, FirmwareI18n::Message::PowerOffDevice);
        lv_obj_set_style_text_color(lbl, DisplayTheme::text(), LV_PART_MAIN);
        lv_obj_set_style_text_font(lbl, &attractap_font_montserrat_latin1_18, LV_PART_MAIN);

        lv_obj_t *cancelBtn = makeButton(confirm, DisplayTheme::primary(), FirmwareI18n::Message::Cancel, &onCancel);
        DisplayTheme::secondaryButton(cancelBtn);
        lv_obj_set_size(cancelBtn, 120, 44);
        lv_obj_set_size(makeButton(confirm, DisplayTheme::danger(), FirmwareI18n::Message::PowerOff, &onConfirm,
                                  LV_SYMBOL_POWER), 150, 44);
        return confirm;
    }
}

lv_obj_t *PowerOffButton::create(lv_obj_t *parent, std::function<void()> cb)
{
    g_onConfirm = cb;
    lv_obj_t *btn = makeButton(parent, DisplayTheme::danger(), FirmwareI18n::Text::literal(LV_SYMBOL_POWER) /* i18n-data: Language-neutral LVGL power icon glyph. */, &onPowerBtn);
    lv_obj_set_size(btn, 56, 40);
    g_button = btn;
    g_confirm = createConfirm(parent);
    lv_obj_add_event_cb(g_button, &onObjectDelete, LV_EVENT_DELETE, nullptr);
    lv_obj_add_event_cb(g_confirm, &onObjectDelete, LV_EVENT_DELETE, nullptr);
    return btn;
}

void PowerOffButton::hideConfirm()
{
    if (g_confirm)
    {
        lv_obj_add_flag(g_confirm, LV_OBJ_FLAG_HIDDEN);
    }
    if (g_button)
    {
        lv_obj_remove_flag(g_button, LV_OBJ_FLAG_HIDDEN);
    }
}

#endif // HAS_POWER_BUTTON
