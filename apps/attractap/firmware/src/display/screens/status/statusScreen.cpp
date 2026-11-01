#include "display/i18n.hpp"
#include "statusScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../shared/statusGlyph.hpp"
#include "../../../platform.hpp"

namespace
{
    // Positions are relative to the content box inside ScreenChrome's insets.
    constexpr int32_t BadgeY = 8;
    constexpr int32_t TitleY = 116;
    constexpr int32_t BodyY = 192;
    constexpr int32_t ButtonY = 272;
    constexpr int32_t BarY = 340;

    lv_obj_t *makeLabel(lv_obj_t *parent, const FirmwareI18n::Text &text, const lv_font_t *font, lv_color_t color,
                        int32_t y, int32_t height, lv_label_long_mode_t mode = LV_LABEL_LONG_WRAP)
    {
        lv_obj_t *label;
        if (mode == LV_LABEL_LONG_DOT)
        {
            label = ScreenChrome::createOneLineLabel(parent, ScreenChrome::ContentWidth, font);
        }
        else
        {
            label = lv_label_create(parent);
            lv_obj_set_style_text_font(label, font, 0);
            lv_obj_set_size(label, ScreenChrome::ContentWidth, height);
            lv_obj_update_layout(label);
            lv_label_set_long_mode(label, mode);
        }
        FirmwareI18n::setLabel(label, text);
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_set_style_text_color(label, color, 0);
        lv_obj_align(label, LV_ALIGN_TOP_MID, 0, y);
        return label;
    }

    // Title in the same slot for every layout, so a longer German title wraps
    // inside it instead of pushing the message.
    lv_obj_t *makeTitle(lv_obj_t *parent, const FirmwareI18n::Text &text, const lv_font_t *font)
    {
        return makeLabel(parent, text, font, DisplayTheme::text(), TitleY, 2 * lv_font_get_line_height(font));
    }

    lv_obj_t *makeButton(lv_obj_t *parent, const FirmwareI18n::Text &text, lv_event_cb_t cb, void *self)
    {
        lv_obj_t *button = lv_button_create(parent);
        DisplayTheme::button(button);
        lv_obj_set_size(button, 200, 52);
        lv_obj_align(button, LV_ALIGN_TOP_MID, 0, ButtonY);
        lv_obj_t *label = lv_label_create(button);
        FirmwareI18n::setLabel(label, text);
        lv_obj_set_style_text_font(label, &attractap_font_montserrat_latin1_20, 0);
        lv_obj_center(label);
        lv_obj_add_event_cb(button, cb, LV_EVENT_CLICKED, self);
        return button;
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

    const auto dismissOnClick = [](lv_event_t *e)
    { static_cast<StatusScreen *>(lv_event_get_user_data(e))->dismiss(); };
    const lv_font_t *titleFont = &attractap_font_montserrat_latin1_28;
    const lv_font_t *bodyFont = &attractap_font_montserrat_latin1_18;

    switch (config.variant)
    {
    case Variant::Error:
        StatusGlyph::create(screen, StatusGlyph::Kind::Cross, DisplayTheme::danger(), BadgeY);
        makeTitle(screen, config.title, titleFont);
        makeLabel(screen, config.message, bodyFont, DisplayTheme::muted(), BodyY, 3 * lv_font_get_line_height(bodyFont));
        break;
    case Variant::Warning:
        StatusGlyph::create(screen, StatusGlyph::Kind::Exclamation, DisplayTheme::warning(), BadgeY);
        makeTitle(screen, config.title, titleFont);
        makeLabel(screen, config.message, bodyFont, DisplayTheme::muted(), BodyY, 3 * lv_font_get_line_height(bodyFont));
        break;
    case Variant::Success:
        StatusGlyph::create(screen, StatusGlyph::Kind::Check, DisplayTheme::success(), BadgeY);
        makeTitle(screen, config.title, &attractap_font_montserrat_latin1_32);
        makeLabel(screen, config.message, bodyFont, DisplayTheme::muted(), BodyY, lv_font_get_line_height(bodyFont), LV_LABEL_LONG_DOT);
        // Nothing to press: a tap anywhere returns.
        lv_obj_add_flag(screen, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(screen, dismissOnClick, LV_EVENT_CLICKED, this);
        break;
    case Variant::Billing:
        StatusGlyph::create(screen, StatusGlyph::Kind::Euro, DisplayTheme::primary(), BadgeY);
        makeLabel(screen, config.title, bodyFont, DisplayTheme::muted(), TitleY + 4, lv_font_get_line_height(bodyFont), LV_LABEL_LONG_DOT);
        // A long formatted total scrolls inside its own row instead of crossing the badge or the button.
        makeLabel(screen, config.detail, &attractap_font_montserrat_latin1_36, DisplayTheme::text(), TitleY + 36,
                  lv_font_get_line_height(&attractap_font_montserrat_latin1_36), LV_LABEL_LONG_SCROLL_CIRCULAR);
        makeLabel(screen, config.message, bodyFont, DisplayTheme::muted(), BodyY + 16, lv_font_get_line_height(bodyFont), LV_LABEL_LONG_DOT);
        break;
    case Variant::Generic:
    {
        lv_obj_t *triangle = lv_obj_create(screen);
        lv_obj_remove_style_all(triangle);
        lv_obj_set_size(triangle, StatusGlyph::Diameter, StatusGlyph::Diameter);
        lv_obj_align(triangle, LV_ALIGN_TOP_MID, 0, BadgeY);
        static const lv_point_precise_t outline[] = {{46, 6}, {88, 82}, {4, 82}, {46, 6}};
        StatusGlyph::createLine(triangle, outline, 4, DisplayTheme::danger());
        StatusGlyph::createGlyphLabel(triangle, "!", &attractap_font_montserrat_latin1_36, DisplayTheme::danger());
        lv_obj_align(lv_obj_get_child(triangle, 1), LV_ALIGN_CENTER, 0, 14);
        makeTitle(screen, config.title, titleFont);
        makeLabel(screen, config.message, bodyFont, DisplayTheme::muted(), BodyY - 36, 3 * lv_font_get_line_height(bodyFont));
        if (!config.detail.empty())
        {
            lv_obj_t *chip = lv_obj_create(screen);
            lv_obj_remove_style_all(chip);
            DisplayTheme::applySurface(chip);
            lv_obj_remove_flag(chip, LV_OBJ_FLAG_SCROLLABLE);
            lv_obj_set_size(chip, LV_SIZE_CONTENT, 34);
            lv_obj_set_style_radius(chip, 17, 0);
            lv_obj_set_style_pad_hor(chip, 14, 0);
            lv_obj_align(chip, LV_ALIGN_TOP_MID, 0, BodyY + 36);
            lv_obj_t *code = ScreenChrome::createOneLineLabel(chip, 380, &attractap_font_montserrat_latin1_14);
            FirmwareI18n::setLabel(code, config.detail);
            lv_obj_set_style_text_color(code, DisplayTheme::muted(), 0);
            lv_obj_center(code);
        }
        break;
    }
    }

    if (config.button)
    {
        makeButton(screen, config.buttonLabel, [](lv_event_t *e)
                   { static_cast<StatusScreen *>(lv_event_get_user_data(e))->dismiss(); }, this);
    }
    if (config.autoReturnMs)
    {
        bar = lv_bar_create(screen);
        lv_obj_set_size(bar, 200, 6);
        lv_obj_align(bar, LV_ALIGN_TOP_MID, 0, config.button ? BarY : ButtonY + 8);
        lv_bar_set_range(bar, 0, 100);
        lv_bar_set_value(bar, 100, LV_ANIM_OFF);
        lv_obj_set_style_radius(bar, 3, LV_PART_MAIN);
        lv_obj_set_style_radius(bar, 3, LV_PART_INDICATOR);
        lv_obj_set_style_bg_color(bar, DisplayTheme::surfaceSecondary(), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_MAIN);
        lv_obj_set_style_bg_color(bar, DisplayTheme::primary(), LV_PART_INDICATOR);
        lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_INDICATOR);
    }
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
