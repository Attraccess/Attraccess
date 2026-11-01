#include "display/i18n.hpp"
#include "confirmScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../shared/statusGlyph.hpp"

namespace
{
    constexpr int32_t ButtonWidth = 200;
    constexpr int32_t ButtonGap = 16;
}

void ConfirmScreen::configure(Config next)
{
    config = std::move(next);
    if (screen)
    {
        build();
    }
}

void ConfirmScreen::init()
{
    if (screen)
    {
        return;
    }
    screen = ScreenChrome::createScreen();
    build();
}

void ConfirmScreen::build()
{
    lv_obj_clean(screen);
    StatusGlyph::create(screen, StatusGlyph::Kind::Power, DisplayTheme::danger(), 8);

    lv_obj_t *title = lv_label_create(screen);
    FirmwareI18n::setLabel(title, config.title);
    lv_label_set_long_mode(title, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(title, lv_pct(100));
    lv_obj_set_height(title, 2 * lv_font_get_line_height(&attractap_font_montserrat_latin1_28));
    lv_obj_set_style_text_align(title, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(title, &attractap_font_montserrat_latin1_28, 0);
    lv_obj_set_style_text_color(title, DisplayTheme::text(), 0);
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 116);

    lv_obj_t *message = lv_label_create(screen);
    FirmwareI18n::setLabel(message, config.message);
    lv_label_set_long_mode(message, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(message, lv_pct(100));
    lv_obj_set_height(message, 3 * lv_font_get_line_height(&attractap_font_montserrat_latin1_18));
    lv_obj_set_style_text_align(message, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(message, &attractap_font_montserrat_latin1_18, 0);
    lv_obj_set_style_text_color(message, DisplayTheme::muted(), 0);
    lv_obj_align(message, LV_ALIGN_TOP_MID, 0, 192);

    const auto makeButton = [&](const FirmwareI18n::Text &text, bool danger, int32_t x, lv_event_cb_t cb)
    {
        lv_obj_t *button = lv_button_create(screen);
        if (danger)
            DisplayTheme::button(button, DisplayTheme::danger());
        else
            DisplayTheme::secondaryButton(button);
        lv_obj_set_size(button, ButtonWidth, 52);
        lv_obj_align(button, LV_ALIGN_TOP_MID, x, 272);
        lv_obj_t *label = ScreenChrome::createOneLineLabel(button, ButtonWidth - 24, &attractap_font_montserrat_latin1_20);
        FirmwareI18n::setLabel(label, text);
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(label);
        lv_obj_add_event_cb(button, cb, LV_EVENT_CLICKED, this);
    };
    makeButton(FirmwareI18n::Message::Cancel, false, -(ButtonWidth + ButtonGap) / 2, [](lv_event_t *e)
               {
        auto *self = static_cast<ConfirmScreen *>(lv_event_get_user_data(e));
        if (self->config.onCancel) self->config.onCancel(); });
    makeButton(config.confirmLabel, true, (ButtonWidth + ButtonGap) / 2, [](lv_event_t *e)
               {
        auto *self = static_cast<ConfirmScreen *>(lv_event_get_user_data(e));
        if (self->config.onConfirm) self->config.onConfirm(); });
}

lv_obj_t *ConfirmScreen::getScreen()
{
    return screen;
}

void ConfirmScreen::loop()
{
}

std::string ConfirmScreen::getName()
{
    return "ConfirmScreen";
}

void ConfirmScreen::onScreenLeave()
{
}

void ConfirmScreen::destroy()
{
    if (screen)
    {
        lv_obj_delete(screen);
    }
    screen = nullptr;
}
