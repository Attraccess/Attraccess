#pragma once

#include "display/fonts/attractap_fonts.hpp"
#include "display/theme.hpp"

// Owned by a screen; covers its complete input area while a request is pending.
class ActionOverlay {
public:
    void show(lv_obj_t *screen, const char *title, const char *resource) {
        if (!screen) return;
        if (!root) {
            root = lv_obj_create(screen);
            lv_obj_remove_style_all(root);
            lv_obj_add_flag(root, LV_OBJ_FLAG_IGNORE_LAYOUT);
            lv_obj_set_size(root, lv_display_get_horizontal_resolution(lv_obj_get_display(screen)),
                            lv_display_get_vertical_resolution(lv_obj_get_display(screen)));
            lv_obj_align(root, LV_ALIGN_CENTER, 0, 0);
            lv_obj_set_style_bg_color(root, lv_color_black(), 0);
            lv_obj_set_style_bg_opa(root, LV_OPA_70, 0);
            lv_obj_add_flag(root, LV_OBJ_FLAG_CLICKABLE);
            lv_obj_remove_flag(root, LV_OBJ_FLAG_SCROLLABLE);
            auto *panel = lv_obj_create(root);
            DisplayTheme::applySurface(panel);
            lv_obj_set_size(panel, lv_pct(88), 174);
            lv_obj_center(panel);
            lv_obj_remove_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
            auto *spinner = lv_spinner_create(panel);
            lv_obj_set_size(spinner, 38, 38);
            lv_obj_align(spinner, LV_ALIGN_TOP_MID, 0, 4);
            lv_obj_set_style_arc_color(spinner, DisplayTheme::primary(), LV_PART_INDICATOR);
            heading = lv_label_create(panel);
            lv_obj_set_width(heading, lv_pct(100));
            lv_obj_set_style_text_font(heading, &attractap_font_montserrat_latin1_20, 0);
            lv_obj_set_style_text_align(heading, LV_TEXT_ALIGN_CENTER, 0);
            lv_obj_align(heading, LV_ALIGN_TOP_MID, 0, 62);
            description = lv_label_create(panel);
            lv_obj_set_width(description, lv_pct(100));
            lv_obj_set_style_text_font(description, &attractap_font_montserrat_latin1_16, 0);
            lv_obj_set_style_text_color(description, DisplayTheme::muted(), 0);
            lv_obj_set_style_text_align(description, LV_TEXT_ALIGN_CENTER, 0);
            lv_obj_align(description, LV_ALIGN_TOP_MID, 0, 112);
            lv_label_set_long_mode(description, LV_LABEL_LONG_DOT);
        }
        lv_label_set_text(heading, title ? title : "Bitte warten");
        lv_label_set_text(description, resource ? resource : "");
        lv_obj_remove_flag(root, LV_OBJ_FLAG_HIDDEN);
        lv_obj_move_foreground(root);
    }
    void hide() { if (root) lv_obj_add_flag(root, LV_OBJ_FLAG_HIDDEN); }
    void detach() { root = heading = description = nullptr; }
private:
    lv_obj_t *root = nullptr, *heading = nullptr, *description = nullptr;
};
