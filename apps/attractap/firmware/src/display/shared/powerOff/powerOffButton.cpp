#include "display/i18n.hpp"
#ifdef HAS_POWER_BUTTON

#include "powerOffButton.hpp"
#include "../../theme.hpp"
#include "../../fonts/attractap_fonts.hpp"

namespace
{
    std::function<void()> g_onConfirm;
    std::function<void(ConfirmScreen::Config)> g_present;
    std::function<void()> g_returnAfterConfirm;

    lv_obj_t *makeButton(lv_obj_t *parent, lv_color_t color, const FirmwareI18n::Text &text, lv_event_cb_t cb)
    {
        lv_obj_t *btn = lv_button_create(parent);
        DisplayTheme::button(btn, color);
        lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, nullptr);

        lv_obj_t *lbl = lv_label_create(btn);
        FirmwareI18n::setLabel(lbl, text);
        lv_obj_set_align(lbl, LV_ALIGN_CENTER);
        lv_obj_set_style_text_font(lbl, &lv_font_montserrat_20, LV_PART_MAIN);
        return btn;
    }

    void onPowerBtn(lv_event_t *)
    {
        if (!g_present)
        {
            return;
        }
        ConfirmScreen::Config config;
        config.title = FirmwareI18n::Message::PowerOffDevice;
        config.message = FirmwareI18n::Message::TheReaderWillPowerOffNow;
        config.confirmLabel = FirmwareI18n::Message::PowerOff;
        config.onConfirm = []
        {
            if (g_onConfirm)
            {
                g_onConfirm(); // cuts SYS_EN — board powers down if on battery
            }
            // On battery the board is already dead here; on USB/DC power SYS_EN
            // has no effect, so go back to the screen instead of leaving the
            // confirmation up.
            if (g_returnAfterConfirm)
            {
                g_returnAfterConfirm();
            }
        };
        g_present(std::move(config));
    }
}

lv_obj_t *PowerOffButton::create(lv_obj_t *parent, std::function<void()> cb)
{
    g_onConfirm = cb;
    lv_obj_t *btn = makeButton(parent, DisplayTheme::danger(), FirmwareI18n::Text::literal(LV_SYMBOL_POWER) /* i18n-data: Language-neutral LVGL power icon glyph. */, &onPowerBtn);
    lv_obj_set_size(btn, 56, 40);
    return btn;
}

void PowerOffButton::setConfirmPresenter(std::function<void(ConfirmScreen::Config)> present, std::function<void()> returnToOrigin)
{
    g_present = std::move(present);
    g_returnAfterConfirm = std::move(returnToOrigin);
}

#endif // HAS_POWER_BUTTON
