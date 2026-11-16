#pragma once

#include <lvgl.h>


#include "../fonts/attractap_fonts.hpp"
#include "../i18n.hpp"
#include "../theme.hpp"

// The glyph at the top of the full-screen status and confirm layouts: a coloured
// ring with a mark drawn from lines (cross, check, exclamation mark), a currency
// sign or the power symbol; or, for the generic error, a bare warning triangle.
namespace StatusGlyph
{
    enum class Kind { Cross, Check, Exclamation, Currency, Power, Triangle };

    constexpr int32_t Diameter = 92;
    constexpr int32_t Ring = 6;
    // Lines are placed in the ring's content box, inside its border.
    constexpr int32_t Inner = Diameter - 2 * Ring;

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
        FirmwareI18n::setDynamicLabel(label, text) /* i18n-data: Language-neutral status glyph or currency code. */;
        lv_obj_set_style_text_font(label, font, 0);
        lv_obj_set_style_text_color(label, color, 0);
        lv_obj_center(label);
        return label;
    }

    // A child of the layout's centred column. `currency`: the sign or code shown by Kind::Currency.
    inline lv_obj_t *create(lv_obj_t *parent, Kind kind, lv_color_t color, const char *currency = nullptr)
    {
        lv_obj_t *circle = lv_obj_create(parent);
        lv_obj_remove_style_all(circle);
        lv_obj_set_size(circle, Diameter, Diameter);
        lv_obj_remove_flag(circle, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_remove_flag(circle, LV_OBJ_FLAG_CLICKABLE);
        if (kind != Kind::Triangle)
        {
            lv_obj_set_style_radius(circle, LV_RADIUS_CIRCLE, 0);
            lv_obj_set_style_border_width(circle, Ring, 0);
            lv_obj_set_style_border_color(circle, color, 0);
        }
        const int32_t c = Inner / 2;
        switch (kind)
        {
        case Kind::Cross:
        {
            static const lv_point_precise_t a[] = {{c - 13, c - 13}, {c + 13, c + 13}};
            static const lv_point_precise_t b[] = {{c + 13, c - 13}, {c - 13, c + 13}};
            createLine(circle, a, 2, color);
            createLine(circle, b, 2, color);
            break;
        }
        case Kind::Check:
        {
            static const lv_point_precise_t points[] = {{c - 19, c + 1}, {c - 6, c + 14}, {c + 20, c - 12}};
            createLine(circle, points, 3, color);
            break;
        }
        case Kind::Exclamation:
        {
            static const lv_point_precise_t stem[] = {{c, c - 20}, {c, c + 6}};
            static const lv_point_precise_t dot[] = {{c, c + 19}, {c, c + 20}};
            createLine(circle, stem, 2, color);
            createLine(circle, dot, 2, color);
            break;
        }
        case Kind::Currency:
            // The euro sign, or the server's currency code when it is another currency.
        {
            // A sign (a non-ASCII character) large, a code such as "CHF" smaller.
            const char *text = currency ? currency : "\xE2\x82\xAC";
            const bool code = static_cast<unsigned char>(text[0]) < 0x80;
            createGlyphLabel(circle, text, code ? &attractap_font_montserrat_latin1_24 : &attractap_font_montserrat_latin1_36, color);
        }
            break;
        case Kind::Power:
            createGlyphLabel(circle, LV_SYMBOL_POWER, &lv_font_montserrat_36, color);
            break;
        case Kind::Triangle:
        {
            static const lv_point_precise_t outline[] = {{46, 6}, {88, 82}, {4, 82}, {46, 6}};
            static const lv_point_precise_t stem[] = {{46, 32}, {46, 56}};
            static const lv_point_precise_t dot[] = {{46, 68}, {46, 69}};
            createLine(circle, outline, 4, color);
            createLine(circle, stem, 2, color);
            createLine(circle, dot, 2, color);
            break;
        }
        }
        return circle;
    }
}
