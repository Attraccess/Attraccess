#include "theme.hpp"
#include <src/themes/lv_theme_private.h>

namespace
{
    lv_theme_t theme;
    lv_style_t screenStyle, surfaceStyle, buttonStyle, pressedStyle, disabledStyle;
    lv_style_t fieldStyle, focusStyle, selectionStyle, keyboardStyle, keyStyle, progressStyle, trackStyle;
    bool initialized = false;

    void flatStyle(lv_style_t &style, lv_color_t bg, lv_color_t fg, int32_t radius)
    {
        lv_style_init(&style);
        lv_style_set_bg_color(&style, bg);
        lv_style_set_bg_opa(&style, LV_OPA_COVER);
        lv_style_set_bg_grad_dir(&style, LV_GRAD_DIR_NONE);
        lv_style_set_text_color(&style, fg);
        lv_style_set_radius(&style, radius);
        lv_style_set_shadow_width(&style, 0);
    }

    void initStyles()
    {
        if (initialized) return;
        initialized = true;
        using namespace DisplayTheme;
        flatStyle(screenStyle, background(), text(), 0);
        lv_style_set_border_width(&screenStyle, 0);
        flatStyle(surfaceStyle, surface(), text(), Radius);
        lv_style_set_border_color(&surfaceStyle, border());
        lv_style_set_border_width(&surfaceStyle, 1);
        flatStyle(buttonStyle, primary(), onPrimary(), Radius);
        lv_style_set_border_width(&buttonStyle, 0);
        flatStyle(pressedStyle, primaryPressed(), onPrimary(), Radius);
        lv_style_set_color_filter_dsc(&pressedStyle, nullptr);
        lv_style_set_recolor_opa(&pressedStyle, LV_OPA_TRANSP);
        flatStyle(disabledStyle, surfaceSecondary(), muted(), Radius);
        lv_style_set_color_filter_dsc(&disabledStyle, nullptr);
        lv_style_set_recolor_opa(&disabledStyle, LV_OPA_TRANSP);
        lv_style_set_border_color(&disabledStyle, border());
        lv_style_set_border_width(&disabledStyle, 1);
        flatStyle(fieldStyle, surface(), text(), Radius);
        lv_style_set_border_color(&fieldStyle, fieldBorder());
        lv_style_set_border_width(&fieldStyle, 1);
        lv_style_init(&focusStyle);
        lv_style_set_border_color(&focusStyle, primary());
        lv_style_set_outline_color(&focusStyle, primary());
        lv_style_init(&selectionStyle);
        lv_style_set_bg_color(&selectionStyle, primary());
        lv_style_set_text_color(&selectionStyle, onPrimary());
        flatStyle(keyboardStyle, surfaceSecondary(), text(), Radius);
        flatStyle(keyStyle, surface(), text(), Radius);
        lv_style_set_border_width(&keyStyle, 1);
        lv_style_set_border_color(&keyStyle, border());
        lv_style_init(&progressStyle);
        lv_style_set_bg_color(&progressStyle, primary());
        lv_style_set_arc_color(&progressStyle, primary());
        lv_style_set_radius(&progressStyle, 3);
        lv_style_init(&trackStyle);
        lv_style_set_bg_color(&trackStyle, surfaceSecondary());
        lv_style_set_arc_color(&trackStyle, border());
        lv_style_set_radius(&trackStyle, 3);
    }

    void applyTheme(lv_theme_t *, lv_obj_t *obj)
    {
        if (lv_obj_get_parent(obj) == nullptr) {
            lv_obj_add_style(obj, &screenStyle, LV_PART_MAIN);
        } else if (lv_obj_check_type(obj, &lv_obj_class)) {
            lv_obj_add_style(obj, &surfaceStyle, LV_PART_MAIN);
        } else if (lv_obj_check_type(obj, &lv_button_class)) {
            lv_obj_add_style(obj, &buttonStyle, LV_PART_MAIN);
            lv_obj_add_style(obj, &pressedStyle, LV_PART_MAIN | LV_STATE_PRESSED);
            lv_obj_add_style(obj, &disabledStyle, LV_PART_MAIN | LV_STATE_DISABLED);
            lv_obj_add_style(obj, &focusStyle, LV_PART_MAIN | LV_STATE_FOCUS_KEY);
        } else if (lv_obj_check_type(obj, &lv_textarea_class) || lv_obj_check_type(obj, &lv_dropdown_class)) {
            lv_obj_add_style(obj, &fieldStyle, LV_PART_MAIN);
            lv_obj_add_style(obj, &focusStyle, LV_PART_MAIN | LV_STATE_FOCUSED);
            lv_obj_add_style(obj, &selectionStyle, LV_PART_SELECTED);
            lv_obj_add_style(obj, &disabledStyle, LV_PART_MAIN | LV_STATE_DISABLED);
        } else if (lv_obj_check_type(obj, &lv_keyboard_class) || lv_obj_check_type(obj, &lv_buttonmatrix_class)) {
            lv_obj_add_style(obj, &keyboardStyle, LV_PART_MAIN);
            lv_obj_add_style(obj, &keyStyle, LV_PART_ITEMS);
            lv_obj_add_style(obj, &buttonStyle, LV_PART_ITEMS | LV_STATE_CHECKED);
            lv_obj_add_style(obj, &pressedStyle, LV_PART_ITEMS | LV_STATE_PRESSED);
            lv_obj_add_style(obj, &disabledStyle, LV_PART_ITEMS | LV_STATE_DISABLED);
        } else if (lv_obj_check_type(obj, &lv_bar_class) || lv_obj_check_type(obj, &lv_arc_class) ||
                   lv_obj_check_type(obj, &lv_spinner_class)) {
            lv_obj_add_style(obj, &trackStyle, LV_PART_MAIN);
            lv_obj_add_style(obj, &progressStyle, LV_PART_INDICATOR);
        }
    }
}

void DisplayTheme::init(lv_display_t *display)
{
    initStyles();
    lv_theme_t *base = lv_theme_default_init(display, primary(), primary(), false, &lv_font_montserrat_18);
    theme = *base;
    lv_theme_set_parent(&theme, base);
    lv_theme_set_apply_cb(&theme, applyTheme);
    lv_display_set_theme(display, &theme);
    applyScreen(lv_display_get_screen_active(display));
}

void DisplayTheme::applyScreen(lv_obj_t *obj)
{
    lv_obj_set_style_bg_color(obj, background(), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_bg_grad_dir(obj, LV_GRAD_DIR_NONE, LV_PART_MAIN);
    lv_obj_set_style_text_color(obj, text(), LV_PART_MAIN);
    lv_obj_set_style_border_width(obj, 0, LV_PART_MAIN);
    lv_obj_set_style_radius(obj, 0, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(obj, 0, LV_PART_MAIN);
}

void DisplayTheme::applySurface(lv_obj_t *obj)
{
    applyScreen(obj);
    lv_obj_set_style_border_width(obj, 1, LV_PART_MAIN);
    lv_obj_set_style_border_color(obj, border(), LV_PART_MAIN);
    lv_obj_set_style_radius(obj, Radius, LV_PART_MAIN);
}

void DisplayTheme::button(lv_obj_t *obj, lv_color_t bg, lv_color_t fg)
{
    lv_obj_set_style_bg_color(obj, bg, LV_PART_MAIN);
    lv_obj_set_style_text_color(obj, fg, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_radius(obj, Radius, LV_PART_MAIN);
    lv_obj_set_style_border_width(obj, 0, LV_PART_MAIN);
    lv_obj_set_style_shadow_width(obj, 0, LV_PART_MAIN);
    lv_obj_set_style_bg_color(obj, lv_color_darken(bg, LV_OPA_20), LV_PART_MAIN | LV_STATE_PRESSED);
    lv_obj_set_style_text_color(obj, fg, LV_PART_MAIN | LV_STATE_PRESSED);
    lv_obj_set_style_color_filter_dsc(obj, nullptr, LV_PART_MAIN | LV_STATE_PRESSED);
    lv_obj_set_style_recolor_opa(obj, LV_OPA_TRANSP, LV_PART_MAIN | LV_STATE_PRESSED);
    lv_obj_set_style_bg_color(obj, surfaceSecondary(), LV_PART_MAIN | LV_STATE_DISABLED);
    lv_obj_set_style_text_color(obj, muted(), LV_PART_MAIN | LV_STATE_DISABLED);
    lv_obj_set_style_border_width(obj, 1, LV_PART_MAIN | LV_STATE_DISABLED);
    lv_obj_set_style_border_color(obj, border(), LV_PART_MAIN | LV_STATE_DISABLED);
    lv_obj_set_style_color_filter_dsc(obj, nullptr, LV_PART_MAIN | LV_STATE_DISABLED);
    lv_obj_set_style_recolor_opa(obj, LV_OPA_TRANSP, LV_PART_MAIN | LV_STATE_DISABLED);
}

void DisplayTheme::secondaryButton(lv_obj_t *obj)
{
    button(obj, surfaceSecondary(), text());
    lv_obj_set_style_border_width(obj, 1, LV_PART_MAIN);
    lv_obj_set_style_border_color(obj, fieldBorder(), LV_PART_MAIN);
}

void DisplayTheme::field(lv_obj_t *obj)
{
    applySurface(obj);
    lv_obj_set_style_border_color(obj, fieldBorder(), LV_PART_MAIN);
    lv_obj_set_style_border_color(obj, primary(), LV_PART_MAIN | LV_STATE_FOCUSED);
    lv_obj_set_style_text_color(obj, muted(), LV_PART_TEXTAREA_PLACEHOLDER);
    lv_obj_set_style_bg_color(obj, primary(), LV_PART_CURSOR);
    lv_obj_set_style_bg_color(obj, primarySoft(), LV_PART_SELECTED);
    lv_obj_set_style_text_color(obj, onPrimarySoft(), LV_PART_SELECTED);
}

void DisplayTheme::keyboard(lv_obj_t *obj)
{
    initStyles();
    lv_obj_add_style(obj, &keyboardStyle, LV_PART_MAIN);
    lv_obj_add_style(obj, &keyStyle, LV_PART_ITEMS);
    lv_obj_add_style(obj, &buttonStyle, LV_PART_ITEMS | LV_STATE_CHECKED);
    lv_obj_add_style(obj, &pressedStyle, LV_PART_ITEMS | LV_STATE_PRESSED);
    lv_obj_add_style(obj, &disabledStyle, LV_PART_ITEMS | LV_STATE_DISABLED);
}
