#pragma once

#include <lvgl.h>

namespace DisplayTheme
{
    // RAL 5021 screen approximation, shared with the web brand. Never recolor images.
    inline lv_color_t background() { return lv_color_hex(0xFFFFFF); }
    inline lv_color_t surface() { return background(); }
    inline lv_color_t surfaceSecondary() { return lv_color_hex(0xF5F7F7); }
    inline lv_color_t text() { return lv_color_hex(0x202729); }
    inline lv_color_t muted() { return lv_color_hex(0x5D6B6E); }
    inline lv_color_t border() { return lv_color_hex(0xD5DEDE); }
    inline lv_color_t fieldBorder() { return lv_color_hex(0x879598); }
    inline lv_color_t primary() { return lv_color_hex(0x256D7B); }
    inline lv_color_t primaryPressed() { return lv_color_hex(0x1C5864); }
    inline lv_color_t onPrimary() { return lv_color_white(); }
    inline lv_color_t primarySoft() { return lv_color_hex(0xEAF3F4); }
    inline lv_color_t onPrimarySoft() { return primaryPressed(); }
    inline lv_color_t success() { return lv_color_hex(0x15803D); }
    inline lv_color_t successSoft() { return lv_color_hex(0xE9F5EE); }
    inline lv_color_t warning() { return lv_color_hex(0xB45309); }
    inline lv_color_t warningSoft() { return lv_color_hex(0xFFF6E5); }
    inline lv_color_t danger() { return lv_color_hex(0xB91C1C); }
    inline lv_color_t dangerSoft() { return lv_color_hex(0xFDEDED); }
    inline constexpr int32_t Radius = 6;

    void init(lv_display_t *display);
    void applyScreen(lv_obj_t *obj);
    void applySurface(lv_obj_t *obj);
    void button(lv_obj_t *obj, lv_color_t bg = primary(), lv_color_t fg = onPrimary());
    void secondaryButton(lv_obj_t *obj);
    void field(lv_obj_t *obj);
    void keyboard(lv_obj_t *obj);
}
