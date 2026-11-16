#pragma once

#include <lvgl.h>

#include "../fonts/attractap_fonts.hpp"
#include "../i18n.hpp"
#include "../theme.hpp"
#include "screenChrome.hpp"

// The full-screen status and confirm layouts: one centred column inside the
// chrome insets (glyph, title, message, buttons, countdown) with fixed gaps,
// vertically balanced like the session summary. Texts wrap inside their own
// width and are cut with dots after their line budget, so nothing crosses.
namespace ResultLayout
{
    constexpr int32_t Gap = 14;
    constexpr int32_t ButtonWidth = 200;
    constexpr int32_t ButtonHeight = 52;
    constexpr int32_t ButtonGap = 16;

    inline lv_obj_t *createColumn(lv_obj_t *screen)
    {
        lv_obj_t *column = lv_obj_create(screen);
        lv_obj_remove_style_all(column);
        lv_obj_set_size(column, lv_pct(100), lv_pct(100));
        lv_obj_remove_flag(column, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_remove_flag(column, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_flex_flow(column, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_flex_align(column, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_pad_row(column, Gap, 0);
        return column;
    }

    // Centred text of at most `maxLines` lines at `width`; longer text ends in dots.
    inline lv_obj_t *createText(lv_obj_t *parent, const FirmwareI18n::Text &text, const lv_font_t *font, lv_color_t color,
                                int32_t maxLines, int32_t width = ScreenChrome::ContentWidth)
    {
        lv_obj_t *label = lv_label_create(parent);
        lv_obj_set_style_text_font(label, font, 0);
        lv_obj_set_style_text_color(label, color, 0);
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_set_width(label, width);
        lv_obj_set_height(label, LV_SIZE_CONTENT);
        lv_obj_set_style_max_height(label, maxLines * lv_font_get_line_height(font), 0);
        lv_label_set_long_mode(label, LV_LABEL_LONG_DOT);
        FirmwareI18n::setLabel(label, text);
        return label;
    }

    inline lv_obj_t *createButton(lv_obj_t *parent, const FirmwareI18n::Text &text, lv_color_t color, bool secondary,
                                  lv_event_cb_t cb, void *userData)
    {
        lv_obj_t *button = lv_button_create(parent);
        if (secondary)
            DisplayTheme::secondaryButton(button);
        else
            DisplayTheme::button(button, color);
        lv_obj_set_size(button, ButtonWidth, ButtonHeight);
        lv_obj_t *label = ScreenChrome::createOneLineLabel(button, ButtonWidth - 24, &attractap_font_montserrat_latin1_20);
        FirmwareI18n::setLabel(label, text);
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(label);
        lv_obj_add_event_cb(button, cb, LV_EVENT_CLICKED, userData);
        return button;
    }

    // A row for buttons side by side.
    inline lv_obj_t *createButtonRow(lv_obj_t *parent)
    {
        lv_obj_t *row = lv_obj_create(parent);
        lv_obj_remove_style_all(row);
        lv_obj_set_size(row, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        lv_obj_remove_flag(row, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_remove_flag(row, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
        lv_obj_set_style_pad_column(row, ButtonGap, 0);
        return row;
    }

    // Thin bar that counts down to the automatic return; it moves in coarse steps, no animation.
    inline lv_obj_t *createCountdown(lv_obj_t *parent)
    {
        lv_obj_t *bar = lv_bar_create(parent);
        lv_obj_set_size(bar, ButtonWidth, 6);
        lv_bar_set_range(bar, 0, 100);
        lv_bar_set_value(bar, 100, LV_ANIM_OFF);
        lv_obj_set_style_radius(bar, 3, LV_PART_MAIN);
        lv_obj_set_style_radius(bar, 3, LV_PART_INDICATOR);
        lv_obj_set_style_bg_color(bar, DisplayTheme::surfaceSecondary(), LV_PART_MAIN);
        lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_MAIN);
        lv_obj_set_style_bg_color(bar, DisplayTheme::primary(), LV_PART_INDICATOR);
        lv_obj_set_style_bg_opa(bar, LV_OPA_COVER, LV_PART_INDICATOR);
        return bar;
    }
}
