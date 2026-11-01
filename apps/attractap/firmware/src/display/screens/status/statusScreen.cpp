#include "display/i18n.hpp"
#include "statusScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../shared/resultLayout.hpp"
#include "../../shared/statusGlyph.hpp"
#include "../../../platform.hpp"

namespace
{
    // The total in the largest size that fits on one line: 48, 36, then 28 px with dots.
    const lv_font_t *amountFont(const std::string &amount)
    {
        static lv_font_t large;
        if (!large.get_glyph_dsc)
        {
            large = lv_font_montserrat_48;
            large.fallback = &attractap_font_montserrat_latin1_36;
        }
        for (const lv_font_t *font : {static_cast<const lv_font_t *>(&large), &attractap_font_montserrat_latin1_36})
            if (lv_text_get_width(amount.c_str(), amount.size(), font, 0) <= ScreenChrome::ContentWidth) return font;
        return &attractap_font_montserrat_latin1_28;
    }

    // The server formats totals as "<amount> <currency>". The badge shows the euro sign for
    // euros and the code itself for any other currency, never a sign that does not match.
    std::string currencyOf(const std::string &amount)
    {
        if (amount.find("\xE2\x82\xAC") != std::string::npos) return "\xE2\x82\xAC";
        const size_t space = amount.find_last_of(' ');
        const std::string code = space == std::string::npos ? std::string() : amount.substr(space + 1);
        if (code == "EUR") return "\xE2\x82\xAC";
        bool letters = !code.empty() && code.size() <= 4;
        for (char ch : code) letters = letters && ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z'));
        return letters ? code : "\xC2\xA4"; // the generic currency sign
    }
}

StatusScreen::Config StatusScreen::error(const FirmwareI18n::Text &title, const FirmwareI18n::Text &message)
{
    Config config;
    config.variant = Variant::Error;
    config.title = title;
    config.message = message;
    config.buttonLabel = FirmwareI18n::Message::Ok;
    config.autoReturnMs = 6000;
    return config;
}

StatusScreen::Config StatusScreen::success(const FirmwareI18n::Text &title, const FirmwareI18n::Text &resourceName)
{
    Config config;
    config.variant = Variant::Success;
    config.title = title;
    config.message = resourceName;
    config.button = false;
    config.autoReturnMs = 2500;
    return config;
}

StatusScreen::Config StatusScreen::billing(const FirmwareI18n::Text &amount, const FirmwareI18n::Text &resourceName)
{
    Config config;
    config.variant = Variant::Billing;
    config.title = FirmwareI18n::Message::SessionTotal;
    config.detail = amount;
    config.message = resourceName;
    config.buttonLabel = FirmwareI18n::Message::Ok;
    config.autoReturnMs = 8000;
    return config;
}

StatusScreen::Config StatusScreen::warning(const FirmwareI18n::Text &title, const FirmwareI18n::Text &message, bool button)
{
    Config config;
    config.variant = Variant::Warning;
    config.title = title;
    config.message = message;
    config.buttonLabel = FirmwareI18n::Message::Ok;
    config.button = button;
    config.autoReturnMs = 6000;
    return config;
}

StatusScreen::Config StatusScreen::info(const FirmwareI18n::Text &title, const FirmwareI18n::Text &message)
{
    Config config;
    config.variant = Variant::Info;
    config.title = title;
    config.message = message;
    config.button = false;
    config.autoReturnMs = 6000;
    return config;
}

StatusScreen::Config StatusScreen::generic(const FirmwareI18n::Text &message, const std::string &code)
{
    Config config;
    config.variant = Variant::Generic;
    config.title = FirmwareI18n::Message::SomethingWentWrong;
    config.message = message;
    if (!code.empty())
    {
        config.detail = FirmwareI18n::Text::format(FirmwareI18n::Message::ErrorCode,
                                                   {FirmwareI18n::Text::literal(code) /* i18n-data: Server error code; preserve exact contents. */});
    }
    config.buttonLabel = FirmwareI18n::Message::Back;
    return config;
}

void StatusScreen::configure(Config next)
{
    config = std::move(next);
    if (screen)
    {
        build();
    }
}

void StatusScreen::init()
{
    if (screen)
    {
        return;
    }
    screen = ScreenChrome::createScreen();
    build();
}

void StatusScreen::build()
{
    lv_obj_clean(screen);
    bar = nullptr;
    dismissed = false;
    shownAt = millis();
    lastBarUpdate = 0;
    lv_obj_remove_flag(screen, LV_OBJ_FLAG_CLICKABLE);

    using ResultLayout::createText;
    lv_obj_t *column = ResultLayout::createColumn(screen);
    const lv_font_t *titleFont = &attractap_font_montserrat_latin1_28;
    const lv_font_t *bodyFont = &attractap_font_montserrat_latin1_18;

    switch (config.variant)
    {
    case Variant::Error:
        StatusGlyph::create(column, StatusGlyph::Kind::Cross, DisplayTheme::danger());
        createText(column, config.title, titleFont, DisplayTheme::text(), 2);
        createText(column, config.message, bodyFont, DisplayTheme::muted(), 3);
        break;
    case Variant::Warning:
        StatusGlyph::create(column, StatusGlyph::Kind::Exclamation, DisplayTheme::warning());
        createText(column, config.title, titleFont, DisplayTheme::text(), 2);
        createText(column, config.message, bodyFont, DisplayTheme::muted(), 3);
        break;
    case Variant::Info:
        StatusGlyph::create(column, StatusGlyph::Kind::Check, DisplayTheme::primary());
        createText(column, config.title, titleFont, DisplayTheme::text(), 2);
        createText(column, config.message, bodyFont, DisplayTheme::muted(), 3);
        break;
    case Variant::Success:
        StatusGlyph::create(column, StatusGlyph::Kind::Check, DisplayTheme::success());
        createText(column, config.title, &attractap_font_montserrat_latin1_32, DisplayTheme::text(), 2);
        createText(column, config.message, bodyFont, DisplayTheme::muted(), 1);
        // Nothing to press: a tap anywhere returns.
        lv_obj_add_flag(screen, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(screen, [](lv_event_t *e)
                            { static_cast<StatusScreen *>(lv_event_get_user_data(e))->dismiss(); }, LV_EVENT_CLICKED, this);
        break;
    case Variant::Billing:
    {
        const std::string amount = config.detail.render(State::getActiveLanguage());
        const std::string currency = currencyOf(amount);
        StatusGlyph::create(column, StatusGlyph::Kind::Currency, DisplayTheme::primary(), currency.c_str());
        createText(column, config.title, bodyFont, DisplayTheme::muted(), 1);
        createText(column, config.detail, amountFont(amount), DisplayTheme::text(), 1);
        createText(column, config.message, bodyFont, DisplayTheme::muted(), 1);
        break;
    }
    case Variant::Generic:
        StatusGlyph::create(column, StatusGlyph::Kind::Triangle, DisplayTheme::danger());
        createText(column, config.title, titleFont, DisplayTheme::text(), 2);
        createText(column, config.message, bodyFont, DisplayTheme::muted(), 3);
        if (!config.detail.empty())
        {
            // The server's error code on a chip as wide as the code, at most 380 px.
            lv_obj_t *chip = lv_obj_create(column);
            lv_obj_remove_style_all(chip);
            DisplayTheme::applySurface(chip);
            lv_obj_remove_flag(chip, LV_OBJ_FLAG_SCROLLABLE);
            lv_obj_remove_flag(chip, LV_OBJ_FLAG_CLICKABLE);
            lv_obj_set_size(chip, LV_SIZE_CONTENT, 34);
            lv_obj_set_style_radius(chip, 17, 0);
            lv_obj_set_style_pad_hor(chip, 14, 0);
            lv_obj_set_style_pad_ver(chip, 0, 0);
            lv_obj_t *code = lv_label_create(chip);
            lv_obj_set_style_text_font(code, &attractap_font_montserrat_latin1_14, 0);
            lv_obj_set_style_text_color(code, DisplayTheme::muted(), 0);
            lv_obj_set_width(code, LV_SIZE_CONTENT);
            lv_obj_set_style_max_width(code, 380 - 2 * 14 - 4, 0);
            lv_obj_set_height(code, lv_font_get_line_height(&attractap_font_montserrat_latin1_14));
            lv_label_set_long_mode(code, LV_LABEL_LONG_DOT);
            FirmwareI18n::setLabel(code, config.detail);
            lv_obj_center(code);
        }
        break;
    }

    if (config.button)
    {
        ResultLayout::createButton(column, config.buttonLabel, DisplayTheme::primary(), false, [](lv_event_t *e)
                                   { static_cast<StatusScreen *>(lv_event_get_user_data(e))->dismiss(); }, this);
    }
    if (config.autoReturnMs)
    {
        bar = ResultLayout::createCountdown(column);
    }
    // Size the texts now: their dot truncation needs the laid-out height.
    lv_obj_update_layout(screen);
}

void StatusScreen::dismiss()
{
    if (dismissed)
    {
        return;
    }
    dismissed = true;
    if (config.onDismiss)
    {
        config.onDismiss();
    }
}

lv_obj_t *StatusScreen::getScreen()
{
    return screen;
}

void StatusScreen::loop()
{
    if (!config.autoReturnMs || dismissed || !screen)
    {
        return;
    }
    const uint32_t elapsed = millis() - shownAt;
    if (elapsed >= config.autoReturnMs)
    {
        dismiss();
        return;
    }
    // The countdown bar moves in coarse steps; no animation on the software renderer.
    if (bar && elapsed - lastBarUpdate >= 250)
    {
        lastBarUpdate = elapsed;
        lv_bar_set_value(bar, 100 - static_cast<int32_t>(elapsed * 100 / config.autoReturnMs), LV_ANIM_OFF);
    }
}

std::string StatusScreen::getName()
{
    return "StatusScreen";
}

void StatusScreen::onScreenLeave()
{
}

void StatusScreen::destroy()
{
    if (screen)
    {
        lv_obj_delete(screen);
    }
    screen = nullptr;
    bar = nullptr;
}
