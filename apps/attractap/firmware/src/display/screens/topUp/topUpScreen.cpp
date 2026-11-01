#include "display/i18n.hpp"
#include "topUpScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../shared/screenChrome.hpp"
#include <cstdlib>

namespace
{
    constexpr size_t MaxDigits = 6; // up to 999999
    constexpr int32_t KeyHeight = 48;
    constexpr int32_t KeyGap = 8;

    // Key identifiers: 0-9 digits, then these.
    constexpr intptr_t KeyBackspace = 10;
    constexpr intptr_t KeySubmit = 11;

    lv_obj_t *makeLabel(lv_obj_t *parent, const FirmwareI18n::Text &text, const lv_font_t *font, lv_color_t color)
    {
        lv_obj_t *label = lv_label_create(parent);
        FirmwareI18n::setLabel(label, text);
        lv_obj_set_style_text_color(label, color, LV_PART_MAIN);
        lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
        return label;
    }
}

void TopUpScreen::init()
{
    if (screen)
    {
        return;
    }
    screen = ScreenChrome::createScreen();

    // Header link back to where the user came from.
    lv_obj_t *cancel = lv_button_create(screen);
    DisplayTheme::secondaryButton(cancel);
    lv_obj_set_size(cancel, 150, 36);
    lv_obj_align(cancel, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_flex_flow(cancel, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(cancel, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(cancel, 8, LV_PART_MAIN);
    lv_obj_t *backIcon = lv_label_create(cancel);
    FirmwareI18n::setDynamicLabel(backIcon, LV_SYMBOL_LEFT) /* i18n-data: Language-neutral LVGL icon glyph. */;
    lv_obj_t *cancelLabel = lv_label_create(cancel);
    FirmwareI18n::setLabel(cancelLabel, FirmwareI18n::Message::Cancel);
    lv_obj_add_event_cb(cancel, [](lv_event_t *e)
                        {
        auto *self = static_cast<TopUpScreen *>(lv_event_get_user_data(e));
        if (self->onCancel) self->onCancel(); }, LV_EVENT_CLICKED, this);

    lv_obj_t *title = ScreenChrome::createOneLineLabel(screen, ScreenChrome::ContentWidth, &attractap_font_montserrat_latin1_24);
    FirmwareI18n::setLabel(title, FirmwareI18n::Message::InsufficientBalance);
    lv_obj_set_style_text_color(title, DisplayTheme::text(), LV_PART_MAIN);
    lv_obj_align(title, LV_ALIGN_TOP_LEFT, 0, 44);

    lv_obj_t *explanation = makeLabel(screen, FirmwareI18n::Message::YourBalanceIsTooLowForThisActionPleaseTopUpYourBalance, &attractap_font_montserrat_latin1_14, DisplayTheme::muted());
    lv_obj_set_width(explanation, lv_pct(100));
    lv_obj_set_height(explanation, 2 * lv_font_get_line_height(&attractap_font_montserrat_latin1_14));
    lv_label_set_long_mode(explanation, LV_LABEL_LONG_WRAP);
    lv_obj_align(explanation, LV_ALIGN_TOP_LEFT, 0, 76);

    // Amount and the button that submits it share one row.
    lv_obj_t *amountBox = lv_obj_create(screen);
    DisplayTheme::field(amountBox);
    lv_obj_remove_flag(amountBox, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(amountBox, 240, 48);
    lv_obj_align(amountBox, LV_ALIGN_TOP_LEFT, 0, 114);
    amountLabel = ScreenChrome::createOneLineLabel(amountBox, 210, &attractap_font_montserrat_latin1_28);
    lv_obj_set_style_text_align(amountLabel, LV_TEXT_ALIGN_RIGHT, LV_PART_MAIN);
    lv_obj_align(amountLabel, LV_ALIGN_RIGHT_MID, -10, 0);

    topUpButton = lv_button_create(screen);
    DisplayTheme::button(topUpButton);
    lv_obj_set_size(topUpButton, 200, 48);
    lv_obj_align(topUpButton, LV_ALIGN_TOP_RIGHT, 0, 114);
    lv_obj_t *topUpLabel = lv_label_create(topUpButton);
    FirmwareI18n::setLabel(topUpLabel, FirmwareI18n::Message::TopUp);
    lv_obj_set_style_text_font(topUpLabel, &attractap_font_montserrat_latin1_20, LV_PART_MAIN);
    lv_obj_center(topUpLabel);
    lv_obj_add_event_cb(topUpButton, [](lv_event_t *e)
                        { static_cast<TopUpScreen *>(lv_event_get_user_data(e))->submit(); }, LV_EVENT_CLICKED, this);

    // Keypad: 1-9, backspace, 0, submit. Part of the layout, it never moves anything.
    const int32_t keyWidth = (448 - 2 * KeyGap) / 3;
    static const char *const captions[] = {"1", "2", "3", "4", "5", "6", "7", "8", "9", LV_SYMBOL_BACKSPACE, "0", LV_SYMBOL_OK};
    static const intptr_t keys[] = {1, 2, 3, 4, 5, 6, 7, 8, 9, KeyBackspace, 0, KeySubmit};
    for (int i = 0; i < 12; ++i)
    {
        lv_obj_t *key = lv_button_create(screen);
        if (keys[i] == KeySubmit)
            DisplayTheme::button(key);
        else
            DisplayTheme::secondaryButton(key);
        lv_obj_set_size(key, keyWidth, KeyHeight);
        lv_obj_align(key, LV_ALIGN_TOP_LEFT, (i % 3) * (keyWidth + KeyGap), 172 + (i / 3) * (KeyHeight + KeyGap));
        lv_obj_t *caption = lv_label_create(key);
        FirmwareI18n::setDynamicLabel(caption, captions[i]) /* i18n-data: Language-neutral keypad glyph. */;
        lv_obj_set_style_text_font(caption, &lv_font_montserrat_24, LV_PART_MAIN);
        lv_obj_center(caption);
        lv_obj_add_event_cb(key, &TopUpScreen::onKey, LV_EVENT_CLICKED, reinterpret_cast<void *>(keys[i]));
        // The keys reach the screen through their own user data.
        lv_obj_set_user_data(key, this);
    }
    updateAmount();
}

void TopUpScreen::onKey(lv_event_t *e)
{
    auto *key = static_cast<lv_obj_t *>(lv_event_get_target(e));
    auto *self = static_cast<TopUpScreen *>(lv_obj_get_user_data(key));
    const intptr_t id = reinterpret_cast<intptr_t>(lv_event_get_user_data(e));
    self->buttonError.clear();
    if (id == KeySubmit)
    {
        self->submit();
        return;
    }
    if (id == KeyBackspace)
    {
        if (!self->digits.empty())
            self->digits.pop_back();
    }
    else if (self->digits.size() < MaxDigits && !(self->digits.empty() && id == 0))
    {
        self->digits.push_back(static_cast<char>('0' + id));
    }
    self->updateAmount();
}

void TopUpScreen::updateAmount()
{
    if (!amountLabel)
    {
        return;
    }
    // "EUR" instead of the euro sign: the display font is Latin-1.
    FirmwareI18n::setDynamicLabel(amountLabel, digits.empty() ? "EUR" : (digits + " EUR").c_str()) /* i18n-data: Typed amount with the language-neutral currency code. */;
    lv_obj_set_style_text_color(amountLabel, digits.empty() ? DisplayTheme::muted() : DisplayTheme::text(), LV_PART_MAIN);
}

void TopUpScreen::submit()
{
    buttonError.clear();
    if (digits.empty())
    {
        buttonError.show(topUpButton, FirmwareI18n::Message::AmountMissing);
        return;
    }
    const long euros = strtol(digits.c_str(), nullptr, 10);
    if (euros <= 0)
    {
        buttonError.show(topUpButton, FirmwareI18n::Message::AmountInvalid);
        return;
    }
    if (onTopUp)
    {
        onTopUp(static_cast<uint32_t>(euros * 100));
    }
}

void TopUpScreen::showError(const FirmwareI18n::Text &text)
{
    buttonError.show(topUpButton, text);
}

void TopUpScreen::reset()
{
    digits.clear();
    buttonError.clear();
    updateAmount();
}

void TopUpScreen::setCallbacks(std::function<void(uint32_t)> onTopUpCallback, std::function<void()> onCancelCallback)
{
    onTopUp = std::move(onTopUpCallback);
    onCancel = std::move(onCancelCallback);
}

lv_obj_t *TopUpScreen::getScreen()
{
    return screen;
}

void TopUpScreen::loop()
{
}

std::string TopUpScreen::getName()
{
    return "TopUpScreen";
}

void TopUpScreen::onScreenLeave()
{
    buttonError.clear();
}

void TopUpScreen::destroy()
{
    if (!screen)
    {
        return;
    }
    buttonError.clear();
    lv_obj_del(screen);
    screen = nullptr;
    amountLabel = nullptr;
    topUpButton = nullptr;
}
