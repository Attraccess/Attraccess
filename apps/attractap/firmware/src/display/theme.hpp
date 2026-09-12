#pragma once

#include <lvgl.h>

namespace DisplayTheme
{
    // Match libs/ui/src/tokens.css dark brand palette. Never recolor images.
    inline lv_color_t background() { return lv_color_hex(0x162124); }
    inline lv_color_t surface() { return lv_color_hex(0x1E2C2F); }
    inline lv_color_t surfaceSecondary() { return lv_color_hex(0x26363A); }
    inline lv_color_t text() { return lv_color_hex(0xF4F8F8); }
    inline lv_color_t muted() { return lv_color_hex(0xAFC0C3); }
    inline lv_color_t border() { return lv_color_hex(0x42575C); }
    inline lv_color_t fieldBorder() { return lv_color_hex(0x64787C); }
    inline lv_color_t primary() { return lv_color_hex(0x82C4CE); }
    inline lv_color_t primaryPressed() { return lv_color_hex(0xA1D5DC); }
    inline lv_color_t onPrimary() { return lv_color_hex(0x142E34); }
    inline lv_color_t primarySoft() { return lv_color_hex(0x203C42); }
    inline lv_color_t onPrimarySoft() { return lv_color_hex(0xB8E1E6); }
    // Bright status colors work as text on dark surfaces and as button fills.
    inline lv_color_t success() { return lv_color_hex(0x74D99F); }
    inline lv_color_t successSoft() { return lv_color_hex(0x193B2A); }
    inline lv_color_t warning() { return lv_color_hex(0xF5C578); }
    inline lv_color_t warningSoft() { return lv_color_hex(0x40331F); }
    inline lv_color_t danger() { return lv_color_hex(0xFF9B9B); }
    inline lv_color_t dangerSoft() { return lv_color_hex(0x43282D); }
    inline constexpr int32_t Radius = 6;

    void init(lv_display_t *display);
    void applyScreen(lv_obj_t *obj);
    void applySurface(lv_obj_t *obj);
    void button(lv_obj_t *obj, lv_color_t bg = primary(), lv_color_t fg = onPrimary());
    void secondaryButton(lv_obj_t *obj);
    void field(lv_obj_t *obj);
    void keyboard(lv_obj_t *obj);
}
