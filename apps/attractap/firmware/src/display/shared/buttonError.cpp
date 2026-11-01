#include "buttonError.hpp"

#include "../fonts/attractap_fonts.hpp"
#include "../theme.hpp"

#include <string>

namespace
{
    constexpr int32_t TextInset = 16;

    // LVGL's built-in Montserrat carries the warning sign; the Latin-1 set carries
    // umlauts, the en dash and the euro sign. Same face and size, so they mix.
    const lv_font_t *const *errorFonts()
    {
        static lv_font_t fonts[3];
        static const lv_font_t *ordered[3] = {nullptr, nullptr, nullptr};
        if (!ordered[0])
        {
            fonts[0] = lv_font_montserrat_18;
            fonts[0].fallback = &attractap_font_montserrat_latin1_18;
            fonts[1] = lv_font_montserrat_16;
            fonts[1].fallback = &attractap_font_montserrat_latin1_16;
            fonts[2] = lv_font_montserrat_14;
            fonts[2].fallback = &attractap_font_montserrat_latin1_14;
            for (int i = 0; i < 3; ++i)
                ordered[i] = &fonts[i];
        }
        return ordered;
    }
}

void ButtonError::onPressed(lv_event_t *e)
{
    auto *self = static_cast<ButtonError *>(lv_event_get_user_data(e));
    if (lv_event_get_target(e) != self->button)
        return;
    const std::function<void()> callback = std::move(self->pressed);
    self->clear();
    if (callback)
        callback();
}

void ButtonError::onDeleted(lv_event_t *e)
{
    // The screen went away with the button; the skin went with it.
    auto *self = static_cast<ButtonError *>(lv_event_get_user_data(e));
    if (lv_event_get_target(e) != self->button)
        return;
    if (self->timer)
    {
        lv_timer_delete(self->timer);
        self->timer = nullptr;
    }
    self->button = nullptr;
    self->skin = nullptr;
}

void ButtonError::show(lv_obj_t *target, const FirmwareI18n::Text &text, uint32_t durationMs, std::function<void()> onPress)
{
    if (!target)
    {
        return;
    }
    clear();
    pressed = std::move(onPress);
    lv_obj_update_layout(target);
    button = target;
    lv_obj_add_event_cb(button, &ButtonError::onPressed, LV_EVENT_PRESSED, this);
    lv_obj_add_event_cb(button, &ButtonError::onDeleted, LV_EVENT_DELETE, this);

    const int32_t width = lv_obj_get_width(button);
    const int32_t height = lv_obj_get_height(button);
    skin = lv_obj_create(button);
    lv_obj_remove_style_all(skin);
    lv_obj_add_flag(skin, LV_OBJ_FLAG_IGNORE_LAYOUT);
    lv_obj_add_flag(skin, LV_OBJ_FLAG_FLOATING);
    lv_obj_remove_flag(skin, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(skin, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(skin, width, height);
    lv_obj_align(skin, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_radius(skin, lv_obj_get_style_radius(button, LV_PART_MAIN), LV_PART_MAIN);
    lv_obj_set_style_bg_color(skin, DisplayTheme::dangerSoft(), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(skin, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_border_color(skin, DisplayTheme::danger(), LV_PART_MAIN);
    lv_obj_set_style_border_width(skin, 2, LV_PART_MAIN);

    const std::string rendered = text.render(State::getActiveLanguage());
    const std::string caption = std::string(LV_SYMBOL_WARNING " ") + rendered;
    const lv_font_t *const *fonts = errorFonts();
    const int32_t textWidth = width - TextInset;
    const lv_font_t *font = nullptr;
    for (int i = 0; i < 3 && !font; ++i)
    {
        if (lv_text_get_width(caption.c_str(), caption.size(), fonts[i], 0) <= textWidth)
            font = fonts[i];
    }
    // Too long for one line even at 14 px: a button tall enough for two lines (a list row)
    // wraps the text instead of cutting it; anything longer still ends in dots.
    int32_t lines = 1;
    if (!font)
    {
        font = fonts[2];
        if (height >= 2 * lv_font_get_line_height(font) + 8)
            lines = 2;
    }
    lv_obj_t *label = lv_label_create(skin);
    lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
    // Dot truncation needs the label's size fixed before it gets its text.
    lv_obj_set_size(label, textWidth, lines * lv_font_get_line_height(font));
    lv_obj_update_layout(label);
    lv_label_set_long_mode(label, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, DisplayTheme::danger(), LV_PART_MAIN);
    FirmwareI18n::setLabel(label, FirmwareI18n::Text::format(FirmwareI18n::Message::WarningPrefixed, {text}));
    lv_obj_center(label);

    timer = lv_timer_create([](lv_timer_t *t)
                            {
        auto *self = static_cast<ButtonError *>(lv_timer_get_user_data(t));
        self->timer = nullptr;
        lv_timer_delete(t);
        self->clear(); },
                            durationMs, this);
}

void ButtonError::forget()
{
    if (button)
    {
        lv_obj_remove_event_cb_with_user_data(button, &ButtonError::onPressed, this);
        lv_obj_remove_event_cb_with_user_data(button, &ButtonError::onDeleted, this);
    }
    button = nullptr;
}

void ButtonError::clear()
{
    if (timer)
    {
        lv_timer_delete(timer);
        timer = nullptr;
    }
    lv_obj_t *doomed = skin;
    skin = nullptr;
    pressed = nullptr;
    forget();
    if (doomed)
    {
        lv_obj_delete(doomed);
    }
}
