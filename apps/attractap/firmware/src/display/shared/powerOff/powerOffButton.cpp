#ifdef HAS_POWER_BUTTON

#include "powerOffButton.hpp"
#include "display/theme.hpp"

namespace
{
    std::function<void()> g_onConfirm;
    lv_obj_t *g_confirm = nullptr;

    lv_obj_t *makeButton(lv_obj_t *parent, lv_color_t color, const char *text, lv_event_cb_t cb)
    {
        lv_obj_t *btn = lv_button_create(parent);
        DisplayTheme::button(btn, color);
        lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, nullptr);

        lv_obj_t *lbl = lv_label_create(btn);
        lv_label_set_text(lbl, text);
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
        // no effect, so dismiss the dialog instead of leaving the UI stuck.
        PowerOffButton::hideConfirm();
    }

    void onPowerBtn(lv_event_t *)
    {
        if (g_confirm)
        {
            return;
        }

        // Built on the top layer so it floats above whatever screen opened it
        // (tabview, flex column, …) without participating in its layout.
        g_confirm = lv_obj_create(lv_layer_top());
        // Modal: full-screen and clickable so taps can't fall through to the
        // screen behind the dimmed backdrop.
        lv_obj_add_flag(g_confirm, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_remove_flag(g_confirm, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_size(g_confirm, lv_pct(100), lv_pct(100));
        lv_obj_align(g_confirm, LV_ALIGN_CENTER, 0, 0);
        lv_obj_set_style_bg_color(g_confirm, lv_color_hex(0x000000), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(g_confirm, 200, LV_PART_MAIN);
        lv_obj_set_style_border_width(g_confirm, 0, LV_PART_MAIN);
        lv_obj_set_style_radius(g_confirm, 0, LV_PART_MAIN);
        lv_obj_set_flex_flow(g_confirm, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(g_confirm, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_row(g_confirm, 24, LV_PART_MAIN);

        // Keep the full-screen click guard; only wrap the existing content in a light card.
        lv_obj_t *dialog = lv_obj_create(g_confirm);
        lv_obj_remove_style_all(dialog);
        DisplayTheme::applySurface(dialog);
        lv_obj_remove_flag(dialog, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_size(dialog, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        lv_obj_set_style_border_width(dialog, 0, LV_PART_MAIN);
        lv_obj_set_style_pad_all(dialog, 16, LV_PART_MAIN);
        lv_obj_set_style_pad_row(dialog, 24, LV_PART_MAIN);
        lv_obj_set_flex_flow(dialog, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(dialog, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

        lv_obj_t *lbl = lv_label_create(dialog);
        lv_label_set_text(lbl, "Geraet ausschalten?");
        lv_obj_set_style_text_color(lbl, DisplayTheme::text(), LV_PART_MAIN);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_24, LV_PART_MAIN);
        lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);

        lv_obj_t *row = lv_obj_create(dialog);
        lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_size(row, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        lv_obj_set_style_bg_opa(row, 0, LV_PART_MAIN);
        lv_obj_set_style_border_width(row, 0, LV_PART_MAIN);
        lv_obj_set_style_pad_all(row, 0, LV_PART_MAIN);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
        lv_obj_set_style_pad_column(row, 16, LV_PART_MAIN);

        lv_obj_t *cancelBtn = makeButton(row, DisplayTheme::primary(), "Abbrechen", &onCancel);
        DisplayTheme::secondaryButton(cancelBtn);
        lv_obj_set_size(cancelBtn, 180, 52);
        lv_obj_set_size(makeButton(row, DisplayTheme::danger(), LV_SYMBOL_POWER "  Ausschalten", &onConfirm), 180, 52);
    }
}

lv_obj_t *PowerOffButton::create(lv_obj_t *parent, std::function<void()> cb)
{
    g_onConfirm = cb;
    lv_obj_t *btn = makeButton(parent, DisplayTheme::danger(), LV_SYMBOL_POWER, &onPowerBtn);
    lv_obj_set_size(btn, 56, 40);
    return btn;
}

void PowerOffButton::hideConfirm()
{
    if (g_confirm)
    {
        lv_obj_del(g_confirm);
        g_confirm = nullptr;
    }
}

bool PowerOffButton::isConfirmVisible()
{
    return g_confirm != nullptr;
}

#endif // HAS_POWER_BUTTON
