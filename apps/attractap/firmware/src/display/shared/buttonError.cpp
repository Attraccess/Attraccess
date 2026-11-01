#include "buttonError.hpp"

#include "../fonts/attractap_fonts.hpp"
#include "../theme.hpp"

namespace
{
    lv_obj_t *captionLabel(lv_obj_t *button)
    {
        for (uint32_t i = 0; i < lv_obj_get_child_count(button); ++i)
        {
            lv_obj_t *child = lv_obj_get_child(button, i);
            if (lv_obj_check_type(child, &lv_label_class))
            {
                return child;
            }
        }
        return nullptr;
    }
}

void ButtonError::onButtonEvent(lv_event_t *e)
{
    auto *self = static_cast<ButtonError *>(lv_event_get_user_data(e));
    auto *source = static_cast<lv_obj_t *>(lv_event_get_target(e));
    switch (lv_event_get_code(e))
    {
    case LV_EVENT_PRESSED:
        if (source == self->button)
            self->clear();
        break;
    case LV_EVENT_DELETE:
        // The screen went away with the button; the skin went with it.
        if (source == self->registeredOn)
            self->registeredOn = nullptr;
        if (source == self->button)
        {
            if (self->timer)
            {
                lv_timer_delete(self->timer);
                self->timer = nullptr;
            }
            self->button = nullptr;
            self->skin = nullptr;
        }
        break;
    default:
        break;
    }
}

void ButtonError::show(lv_obj_t *target, const FirmwareI18n::Text &text, uint32_t durationMs)
{
    if (!target)
    {
        return;
    }
    clear();
    lv_obj_t *caption = captionLabel(target);
    lv_obj_update_layout(target);
    button = target;
    if (registeredOn != button)
    {
        lv_obj_add_event_cb(button, &ButtonError::onButtonEvent, LV_EVENT_ALL, this);
        registeredOn = button;
    }

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

    lv_obj_t *label = lv_label_create(skin);
    // The button's own font, or a small one when the text would not fit a narrow button.
    const lv_font_t *font = caption ? lv_obj_get_style_text_font(caption, LV_PART_MAIN) : &attractap_font_montserrat_latin1_14;
    const std::string rendered = text.render(State::getActiveLanguage());
    if (lv_text_get_width(rendered.c_str(), rendered.size(), font, 0) > width - 16)
    {
        font = &attractap_font_montserrat_latin1_14;
    }
    lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
    // One line: dot truncation needs the label's size fixed before it gets its text.
    lv_obj_set_size(label, width - 16, lv_font_get_line_height(font));
    lv_obj_update_layout(label);
    lv_label_set_long_mode(label, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_obj_set_style_text_color(label, DisplayTheme::danger(), LV_PART_MAIN);
    FirmwareI18n::setLabel(label, text);
    lv_obj_center(label);

    timer = lv_timer_create([](lv_timer_t *t)
                            {
        auto *self = static_cast<ButtonError *>(lv_timer_get_user_data(t));
        self->timer = nullptr;
        lv_timer_delete(t);
        self->clear(); },
                            durationMs, this);
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
    button = nullptr;
    if (doomed)
    {
        lv_obj_delete(doomed);
    }
}
