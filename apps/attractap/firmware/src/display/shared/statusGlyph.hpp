#pragma once

#include <lvgl.h>

#include "../fonts/attractap_fonts.hpp"
#include "../i18n.hpp"
#include "../theme.hpp"

// The round badge at the top of the full-screen status and confirm layouts:
// a coloured ring with a glyph that does not depend on font coverage.
namespace StatusGlyph
{
    enum class Kind { Cross, Check, Exclamation, Euro, Power };

    constexpr int32_t Diameter = 92;

    inline lv_obj_t *createLine(lv_obj_t *parent, const lv_point_precise_t *points, uint32_t count, lv_color_t color)
    {
        lv_obj_t *line = lv_line_create(parent);
        lv_line_set_points(line, points, count);
        lv_obj_set_style_line_width(line, 6, 0);
        lv_obj_set_style_line_rounded(line, true, 0);
        lv_obj_set_style_line_color(line, color, 0);
        return line;
    }

    inline lv_obj_t *createGlyphLabel(lv_obj_t *circle, const char *text, const lv_font_t *font, lv_color_t color)
    {
        lv_obj_t *label = lv_label_create(circle);
        FirmwareI18n::setDynamicLabel(label, text) /* i18n-data: Language-neutral status glyph. */;
        lv_obj_set_style_text_font(label, font, 0);
        lv_obj_set_style_text_color(label, color, 0);
        lv_obj_center(label);
        return label;
    }

    // Placed at the horizontal centre; the caller sets the y position.
    inline lv_obj_t *create(lv_obj_t *parent, Kind kind, lv_color_t color, int32_t y)
    {
        lv_obj_t *circle = lv_obj_create(parent);
        lv_obj_remove_style_all(circle);
        lv_obj_set_size(circle, Diameter, Diameter);
        lv_obj_align(circle, LV_ALIGN_TOP_MID, 0, y);
        lv_obj_set_style_radius(circle, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_border_width(circle, 6, 0);
        lv_obj_set_style_border_color(circle, color, 0);
        lv_obj_remove_flag(circle, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_remove_flag(circle, LV_OBJ_FLAG_CLICKABLE);
        switch (kind)
        {
        case Kind::Cross:
        {
            static const lv_point_precise_t a[] = {{30, 30}, {56, 56}};
            static const lv_point_precise_t b[] = {{56, 30}, {30, 56}};
            createLine(circle, a, 2, color);
            createLine(circle, b, 2, color);
            break;
        }
        case Kind::Check:
        {
            static const lv_point_precise_t points[] = {{23, 46}, {37, 60}, {66, 31}};
            createLine(circle, points, 3, color);
            break;
        }
        case Kind::Exclamation:
            createGlyphLabel(circle, "!", &attractap_font_montserrat_latin1_36, color);
            break;
        case Kind::Euro:
            createGlyphLabel(circle, "EUR", &attractap_font_montserrat_latin1_24, color);
            break;
        case Kind::Power:
            createGlyphLabel(circle, LV_SYMBOL_POWER, &lv_font_montserrat_36, color);
            break;
        }
        return circle;
    }
}
