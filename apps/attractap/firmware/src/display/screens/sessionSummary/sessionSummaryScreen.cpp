#include "sessionSummaryScreen.hpp"
#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include <cstdio>

void SessionSummaryScreen::setSummary(const std::string &username, uint32_t seconds, const std::string &total) {
    name = username;
    charge = total;
    char text[32];
    snprintf(text, sizeof(text), "%02lu:%02lu:%02lu", static_cast<unsigned long>(seconds / 3600),
             static_cast<unsigned long>((seconds / 60) % 60), static_cast<unsigned long>(seconds % 60));
    duration = text;
}

void SessionSummaryScreen::clearSummary() { name.clear(); duration.clear(); charge.clear(); }

void SessionSummaryScreen::init() {
    if (screen) return;
    screen = lv_obj_create(nullptr);
    DisplayTheme::applyScreen(screen);
    lv_obj_set_style_pad_all(screen, 0, 0);
    lv_obj_remove_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
    auto label = [&](const char *text, int x, int y, int width, const lv_font_t *font, lv_color_t color) {
        auto *obj = lv_label_create(screen);
        lv_label_set_text(obj, text);
        lv_obj_set_width(obj, width);
        lv_label_set_long_mode(obj, LV_LABEL_LONG_DOT);
        lv_obj_set_style_text_align(obj, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_set_style_text_font(obj, font, 0);
        lv_obj_set_height(obj, lv_font_get_line_height(font));
        lv_obj_set_style_text_color(obj, color, 0);
        lv_obj_set_pos(obj, x, y);
        return obj;
    };
    auto *circle = lv_obj_create(screen);
    lv_obj_remove_style_all(circle);
    lv_obj_set_size(circle, 96, 96);
    lv_obj_align(circle, LV_ALIGN_TOP_MID, 0, 102);
    lv_obj_set_style_radius(circle, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(circle, 6, 0);
    lv_obj_set_style_border_color(circle, DisplayTheme::success(), 0);
    lv_obj_remove_flag(circle, LV_OBJ_FLAG_SCROLLABLE);
    auto *check = lv_line_create(circle);
    static const lv_point_precise_t points[] = {{23, 46}, {37, 60}, {66, 31}};
    lv_line_set_points(check, points, 3);
    lv_obj_set_style_line_width(check, 6, 0);
    lv_obj_set_style_line_rounded(check, true, 0);
    lv_obj_set_style_line_color(check, DisplayTheme::success(), 0);
    label(("Danke, " + name + "!").c_str(), 20, 224, 440, &attractap_font_montserrat_latin1_32, DisplayTheme::text());
    const bool billed = !charge.empty();
    const int durationX = billed ? 50 : 140;
    label("Dauer", durationX, 286, 200, &attractap_font_montserrat_latin1_18, DisplayTheme::muted());
    label(duration.c_str(), durationX, 313, 200, &attractap_font_montserrat_latin1_18, DisplayTheme::text());
    if (billed) {
        label("Abgerechnet", 250, 286, 180, &attractap_font_montserrat_latin1_18, DisplayTheme::muted());
        auto *total = label(charge.c_str(), 250, 313, 180, &attractap_font_montserrat_latin1_18, DisplayTheme::text());
        // Long formatted charges remain fully available without crossing columns.
        lv_label_set_long_mode(total, LV_LABEL_LONG_SCROLL_CIRCULAR);
    }
    label("Bis bald!", 20, 363, 440, &attractap_font_montserrat_latin1_18, DisplayTheme::muted());
    auto *brand = label("Attractap", 20, 452, 140, &lv_font_montserrat_14, DisplayTheme::muted());
    lv_obj_set_style_text_align(brand, LV_TEXT_ALIGN_LEFT, 0);
    auto *variant = label(FIRMWARE_VARIANT_FRIENDLY_NAME, 240, 452, 220, &lv_font_montserrat_14, DisplayTheme::muted());
    lv_obj_set_style_text_align(variant, LV_TEXT_ALIGN_RIGHT, 0);
}

void SessionSummaryScreen::destroy() {
    if (screen) lv_obj_delete(screen);
    screen = nullptr;
    clearSummary();
}
