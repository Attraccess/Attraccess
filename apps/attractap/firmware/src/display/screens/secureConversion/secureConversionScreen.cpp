#include "secureConversionScreen.hpp"

#include "display/i18n.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../theme.hpp"

namespace
{
    lv_obj_t *centeredLabel(lv_obj_t *parent, int y, const lv_font_t *font, lv_color_t color)
    {
        lv_obj_t *label = lv_label_create(parent);
        lv_obj_set_width(label, 420);
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
        lv_obj_set_align(label, LV_ALIGN_CENTER);
        lv_obj_set_y(label, y);
        lv_obj_set_style_text_color(label, color, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_text_font(label, font, LV_PART_MAIN | LV_STATE_DEFAULT);
        return label;
    }

    FirmwareI18n::Message stepMessage(ConversionUi::Phase phase)
    {
        switch (phase)
        {
        case ConversionUi::Phase::Verify:
            return FirmwareI18n::Message::SecureConversionVerify;
        case ConversionUi::Phase::Burn:
            return FirmwareI18n::Message::SecureConversionBurn;
        case ConversionUi::Phase::Bootloader:
            return FirmwareI18n::Message::SecureConversionBootloader;
        case ConversionUi::Phase::Transfer:
        case ConversionUi::Phase::None:
        default:
            return FirmwareI18n::Message::SecureConversionTransfer;
        }
    }
}

void SecureConversionScreen::init()
{
    if (this->screen)
    {
        return;
    }
    this->screen = lv_obj_create(NULL);
    lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
    DisplayTheme::applyScreen(this->screen);

    this->title = centeredLabel(this->screen, -150, &attractap_font_montserrat_latin1_28, DisplayTheme::text());
    FirmwareI18n::setLabel(this->title, FirmwareI18n::Message::SecureConversionTitle);
    this->step = centeredLabel(this->screen, -80, &attractap_font_montserrat_latin1_20, DisplayTheme::muted());

    this->progressBar = lv_bar_create(this->screen);
    lv_bar_set_range(this->progressBar, 0, 100);
    lv_obj_set_size(this->progressBar, 400, 40);
    lv_obj_set_align(this->progressBar, LV_ALIGN_CENTER);
    lv_obj_set_style_bg_color(this->progressBar, DisplayTheme::surfaceSecondary(), LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(this->progressBar, 255, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_radius(this->progressBar, 6, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_color(this->progressBar, DisplayTheme::primary(), LV_PART_INDICATOR | LV_STATE_DEFAULT);
    lv_obj_set_style_bg_opa(this->progressBar, 255, LV_PART_INDICATOR | LV_STATE_DEFAULT);
    lv_obj_set_style_radius(this->progressBar, 6, LV_PART_INDICATOR | LV_STATE_DEFAULT);

    this->warning = centeredLabel(this->screen, 80, &attractap_font_montserrat_latin1_28, DisplayTheme::danger());
    FirmwareI18n::setLabel(this->warning, FirmwareI18n::Message::SecureConversionDontUnplug);
    this->hint = centeredLabel(this->screen, 150, &attractap_font_montserrat_latin1_18, DisplayTheme::muted());
    FirmwareI18n::setLabel(this->hint, FirmwareI18n::Message::SecureConversionRestartHint);
    this->applied = false;
    this->apply();
}

void SecureConversionScreen::show(ConversionUi::Phase nextPhase, int nextPercent)
{
    if (this->applied && nextPhase == this->phase && nextPercent == this->percent)
    {
        return;
    }
    this->phase = nextPhase;
    this->percent = nextPercent;
    this->apply();
}

void SecureConversionScreen::apply()
{
    if (!this->screen)
    {
        return;
    }
    this->applied = true;
    setLabelTextIfChanged(this->step, stepMessage(this->phase));
    const bool transfer = this->phase == ConversionUi::Phase::Transfer;
    lv_bar_set_value(this->progressBar, transfer ? this->percent : 100, LV_ANIM_OFF);
    const bool dontUnplug = ConversionUi::dontUnplug(this->phase);
    if (dontUnplug)
        lv_obj_remove_flag(this->warning, LV_OBJ_FLAG_HIDDEN);
    else
        lv_obj_add_flag(this->warning, LV_OBJ_FLAG_HIDDEN);
    if (this->phase == ConversionUi::Phase::Bootloader)
        lv_obj_remove_flag(this->hint, LV_OBJ_FLAG_HIDDEN);
    else
        lv_obj_add_flag(this->hint, LV_OBJ_FLAG_HIDDEN);
}

void SecureConversionScreen::destroy()
{
    if (!this->screen)
    {
        return;
    }
    lv_obj_del(this->screen);
    this->screen = nullptr;
    this->title = nullptr;
    this->step = nullptr;
    this->progressBar = nullptr;
    this->warning = nullptr;
    this->hint = nullptr;
    this->applied = false;
}
