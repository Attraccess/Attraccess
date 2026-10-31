#include "display/i18n.hpp"
#include "topUpScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../theme.hpp"
#include "../../shared/fullScreenView.hpp"
#include <cstdlib>

namespace
{
    lv_obj_t *makeLabel(lv_obj_t *parent, const FirmwareI18n::Text &text, const lv_font_t *font, lv_color_t color)
    {
        lv_obj_t *label = lv_label_create(parent);
        FirmwareI18n::setLabel(label, text);
        lv_obj_set_width(label, lv_pct(100));
        lv_obj_set_style_text_color(label, color, LV_PART_MAIN | LV_STATE_DEFAULT);
        lv_obj_set_style_text_font(label, font, LV_PART_MAIN | LV_STATE_DEFAULT);
        return label;
    }

    // Grows with its share of the row, like the usage forms' footer.
    lv_obj_t *makeButton(lv_obj_t *parent, const FirmwareI18n::Text &text, bool primary, uint8_t grow, lv_event_cb_t cb, void *self)
    {
        lv_obj_t *btn = lv_button_create(parent);
        lv_obj_set_flex_grow(btn, grow);
        lv_obj_set_height(btn, LV_SIZE_CONTENT);
        lv_obj_set_style_pad_all(btn, 12, LV_PART_MAIN | LV_STATE_DEFAULT);
        if (primary)
            DisplayTheme::button(btn);
        else
            DisplayTheme::secondaryButton(btn);
        lv_obj_t *label = lv_label_create(btn);
        FirmwareI18n::setLabel(label, text);
        lv_obj_set_align(label, LV_ALIGN_CENTER);
        lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, self);
        return btn;
    }
}

void TopUpScreen::init()
{
    if (this->screen)
    {
        return;
    }
    this->screen = lv_obj_create(NULL);
    lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);
    DisplayTheme::applyScreen(this->screen);
    FullScreenInsets::apply(this->screen);
    lv_obj_set_style_pad_row(this->screen, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_flex_flow(this->screen, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(this->screen, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);

    makeLabel(this->screen, FirmwareI18n::Message::InsufficientBalance, &attractap_font_montserrat_latin1_18, DisplayTheme::text());
    makeLabel(this->screen, FirmwareI18n::Message::YourBalanceIsTooLowForThisActionPleaseTopUpYourBalance, &attractap_font_montserrat_latin1_14, DisplayTheme::muted());
    makeLabel(this->screen, FirmwareI18n::Message::AmountEur, &attractap_font_montserrat_latin1_14, DisplayTheme::text());

    this->amountInput = lv_textarea_create(this->screen);
    lv_textarea_set_one_line(this->amountInput, true);
    lv_textarea_set_max_length(this->amountInput, 6); // e.g., up to 999999
    lv_textarea_set_accepted_chars(this->amountInput, "0123456789");
    lv_obj_set_width(this->amountInput, lv_pct(100));
    DisplayTheme::field(this->amountInput);
    lv_obj_set_style_pad_left(this->amountInput, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_set_style_pad_right(this->amountInput, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_add_event_cb(this->amountInput, &TopUpScreen::onInputEvent, LV_EVENT_ALL, this);

    this->errorLabel = makeLabel(this->screen, FirmwareI18n::Text::literal("") /* i18n-data: Empty control caption; no prose. */,
                                 &attractap_font_montserrat_latin1_14, DisplayTheme::danger());

    lv_obj_t *footer = lv_obj_create(this->screen);
    lv_obj_remove_style_all(footer);
    lv_obj_set_width(footer, lv_pct(100));
    lv_obj_set_height(footer, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(footer, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(footer, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(footer, 8, LV_PART_MAIN | LV_STATE_DEFAULT);
    lv_obj_remove_flag(footer, LV_OBJ_FLAG_SCROLLABLE);
    makeButton(footer, FirmwareI18n::Message::Cancel, false, 1, &TopUpScreen::onCancelClick, this);
    makeButton(footer, FirmwareI18n::Message::TopUp, true, 2, &TopUpScreen::onTopUpClick, this);

    // Pinned to the bottom, outside the column layout, so it never pushes or
    // covers the field above it.
    this->keyboard = lv_keyboard_create(this->screen);
    lv_obj_add_flag(this->keyboard, LV_OBJ_FLAG_IGNORE_LAYOUT);
    DisplayTheme::keyboard(this->keyboard);
    lv_obj_set_size(this->keyboard, lv_pct(100), lv_pct(40));
    lv_obj_align(this->keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_keyboard_set_mode(this->keyboard, LV_KEYBOARD_MODE_NUMBER);
    lv_keyboard_set_textarea(this->keyboard, this->amountInput);
    lv_obj_add_event_cb(this->keyboard, &TopUpScreen::onKeyboardEvent, LV_EVENT_ALL, this);
    lv_obj_add_state(this->amountInput, LV_STATE_FOCUSED);
}

void TopUpScreen::reset()
{
    if (!this->screen)
    {
        return;
    }
    lv_textarea_set_text(this->amountInput, "");
    FirmwareI18n::setLabel(this->errorLabel, FirmwareI18n::Text::literal("") /* i18n-data: Empty control caption; no prose. */);
    lv_obj_remove_flag(this->keyboard, LV_OBJ_FLAG_HIDDEN);
}

void TopUpScreen::setCallbacks(std::function<void(uint32_t)> onTopUp, std::function<void()> onCancel)
{
    this->onTopUp = std::move(onTopUp);
    this->onCancel = std::move(onCancel);
}

void TopUpScreen::onTopUpClick(lv_event_t *e)
{
    auto *self = static_cast<TopUpScreen *>(lv_event_get_user_data(e));
    const char *text = lv_textarea_get_text(self->amountInput);
    bool hasDigits = false;
    for (const char *p = text; p && *p; ++p)
    {
        if (*p >= '0' && *p <= '9')
        {
            hasDigits = true;
            break;
        }
    }
    if (!hasDigits)
    {
        FirmwareI18n::setLabel(self->errorLabel, FirmwareI18n::Message::PleaseEnterAnAmount);
        return;
    }
    const long euros = strtol(text, NULL, 10);
    if (euros <= 0)
    {
        FirmwareI18n::setLabel(self->errorLabel, FirmwareI18n::Message::PleaseEnterAValidAmount);
        return;
    }
    if (self->onTopUp)
    {
        self->onTopUp(static_cast<uint32_t>(euros * 100));
    }
}

void TopUpScreen::onCancelClick(lv_event_t *e)
{
    auto *self = static_cast<TopUpScreen *>(lv_event_get_user_data(e));
    if (self->onCancel)
    {
        self->onCancel();
    }
}

void TopUpScreen::onInputEvent(lv_event_t *e)
{
    const auto code = lv_event_get_code(e);
    if (code != LV_EVENT_CLICKED && code != LV_EVENT_FOCUSED)
    {
        return;
    }
    auto *self = static_cast<TopUpScreen *>(lv_event_get_user_data(e));
    lv_obj_remove_flag(self->keyboard, LV_OBJ_FLAG_HIDDEN);
}

void TopUpScreen::onKeyboardEvent(lv_event_t *e)
{
    const auto code = lv_event_get_code(e);
    if (code != LV_EVENT_READY && code != LV_EVENT_CANCEL)
    {
        return;
    }
    auto *self = static_cast<TopUpScreen *>(lv_event_get_user_data(e));
    lv_obj_add_flag(self->keyboard, LV_OBJ_FLAG_HIDDEN);
}

lv_obj_t *TopUpScreen::getScreen()
{
    return this->screen;
}

void TopUpScreen::loop()
{
    // nothing to do
}

std::string TopUpScreen::getName()
{
    return "TopUpScreen";
}

void TopUpScreen::onScreenLeave()
{
}

void TopUpScreen::destroy()
{
    if (!this->screen)
    {
        return;
    }
    lv_obj_del(this->screen);
    this->screen = nullptr;
    this->amountInput = nullptr;
    this->errorLabel = nullptr;
    this->keyboard = nullptr;
}
