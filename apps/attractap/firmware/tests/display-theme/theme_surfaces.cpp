#include "render_harness.hpp"

void testLatin1Fonts(Renderer &renderer)
{
    const std::array<const lv_font_t *, 10> fonts = {
        &attractap_font_montserrat_latin1_10, &attractap_font_montserrat_latin1_14,
        &attractap_font_montserrat_latin1_16, &attractap_font_montserrat_latin1_18,
        &attractap_font_montserrat_latin1_20, &attractap_font_montserrat_latin1_24,
        &attractap_font_montserrat_latin1_26, &attractap_font_montserrat_latin1_28,
        &attractap_font_montserrat_latin1_32, &attractap_font_montserrat_latin1_36};
    ScreenGuard screen(lv_obj_create(nullptr));
    auto *sample = label(screen.root, "ÄÖÜ äöü ß | München, Größe, für\nASCII: Abc 0123");
    lv_obj_set_width(sample, 460);
    lv_obj_center(sample);
    for (size_t i = 0; i < fonts.size(); ++i) {
        for (uint32_t codepoint = 0x21; codepoint <= 0xFF; ++codepoint) {
            if (codepoint >= 0x7F && codepoint <= 0xA0) continue;
            lv_font_glyph_dsc_t glyph{};
            expect(lv_font_get_glyph_dsc(fonts[i], &glyph, codepoint, 0) && !glyph.is_placeholder,
                   "Every printable ASCII and Latin-1 glyph exists at every configured size");
            if (glyph.box_w == 0 || glyph.box_h == 0) continue;
            auto *buffer = lv_draw_buf_create(glyph.box_w, glyph.box_h, LV_COLOR_FORMAT_A8, LV_STRIDE_AUTO);
            expect(buffer != nullptr, "Allocate glyph draw buffer");
            const bool rendered = lv_font_get_glyph_bitmap(&glyph, buffer) != nullptr;
            lv_font_glyph_release_draw_data(&glyph);
            lv_draw_buf_destroy(buffer);
            expect(rendered, "LVGL decodes the actual glyph bitmap with production compression settings");
        }
        lv_obj_set_style_text_font(sample, fonts[i], LV_PART_MAIN);
        renderer.capture("latin1-font-" + std::to_string(i));
    }
}

void testSurfaces(Renderer &renderer)
{
    expectColor(DisplayTheme::primary(), lv_color_hex(0x82C4CE), "Frontend dark primary token");
    expectColor(DisplayTheme::background(), lv_color_hex(0x162124), "Frontend dark screen token");
    expectColor(DisplayTheme::surface(), lv_color_hex(0x1E2C2F), "Frontend dark surface token");
    expectColor(DisplayTheme::text(), lv_color_hex(0xF4F8F8), "Frontend dark foreground token");
    expectColor(lv_obj_get_style_bg_color(lv_screen_active(), LV_PART_MAIN), DisplayTheme::background(),
                "init themes the already-created active screen");
    ScreenGuard screen(lv_obj_create(nullptr));
    expectFlat(screen.root, 0);
    expect(lv_obj_get_style_border_width(screen.root, LV_PART_MAIN) == 0, "Screen has no border");
    auto *title = label(screen.root, "Production theme: surfaces");
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 24);
    const auto *bodyFont = lv_obj_get_style_text_font(title, LV_PART_MAIN);
    expect(bodyFont->dsc == lv_font_montserrat_18.dsc && bodyFont->line_height == lv_font_montserrat_18.line_height &&
               bodyFont->fallback == &attractap_font_montserrat_latin1_18,
           "Inherited 18px font retains LVGL metrics and adds Latin-1 fallback");
    for (uint32_t glyph : {0x00C4, 0x00D6, 0x00DC, 0x00DF, 0x00E4, 0x00F6, 0x00FC}) {
        lv_font_glyph_dsc_t descriptor{};
        expect(lv_font_get_glyph_dsc(bodyFont, &descriptor, glyph, 0) && !descriptor.is_placeholder,
               "Inherited body font renders German glyphs without replacement boxes");
    }
    lv_font_glyph_dsc_t symbol{};
    expect(lv_font_get_glyph_dsc(bodyFont, &symbol, 0xF00D, 0) && !symbol.is_placeholder,
           "Inherited body font retains the close icon");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::text(), "Inherited body text");
    auto *surface = lv_obj_create(screen.root);
    lv_obj_set_size(surface, 400, 140);
    lv_obj_center(surface);
    expectFlat(surface, DisplayTheme::Radius);
    expectColor(lv_obj_get_style_bg_color(surface, LV_PART_MAIN), DisplayTheme::surface(), "Automatic surface fill");
    expectColor(lv_obj_get_style_border_color(surface, LV_PART_MAIN), DisplayTheme::border(), "Automatic surface border");
    DisplayTheme::applyScreen(surface);
    expectFlat(surface, 0);
    expect(lv_obj_get_style_border_width(surface, LV_PART_MAIN) == 0, "applyScreen removes border");
    DisplayTheme::applySurface(surface);
    expectColor(lv_obj_get_style_bg_color(surface, LV_PART_MAIN), DisplayTheme::surface(), "Helper surface fill");
    expectFlat(surface, DisplayTheme::Radius);
    expect(lv_obj_get_style_border_width(surface, LV_PART_MAIN) == 1, "applySurface adds border");
    lv_obj_center(label(surface, "Dark surface / light text"));
    renderer.capture("widgets-surfaces");
    renderer.expectPixel(2, 2, DisplayTheme::background(), "Rendered dark background");
}

void testButtons(Renderer &renderer, bool helpers)
{
    ScreenGuard screen(lv_obj_create(nullptr));
    lv_obj_align(label(screen.root, helpers ? "Production button helpers" : "Automatic button theme"), LV_ALIGN_TOP_MID, 0, 18);
    const std::array<lv_state_t, 5> states = {LV_STATE_DEFAULT, LV_STATE_PRESSED, LV_STATE_DISABLED,
        LV_STATE_DISABLED | LV_STATE_PRESSED, LV_STATE_FOCUSED | LV_STATE_FOCUS_KEY};
    const char *names[] = {"Default", "Pressed", "Disabled", "Dis + press", "Focus key"};
    const int columns = helpers ? 3 : 1;
    std::vector<std::pair<lv_obj_t *, lv_color_t>> samples;
    for (int column = 0; column < columns; ++column) {
        const auto bg = column == 1 ? DisplayTheme::surfaceSecondary() : column == 2 ? DisplayTheme::danger() : DisplayTheme::primary();
        const auto fg = column == 1 ? DisplayTheme::text() : DisplayTheme::onPrimary();
        for (size_t row = 0; row < states.size(); ++row) {
            auto *button = lv_button_create(screen.root);
            lv_obj_set_size(button, helpers ? 140 : 280, 56);
            lv_obj_set_pos(button, helpers ? 20 + column * 150 : 100, 60 + row * 78);
            if (helpers) {
                if (column == 1) DisplayTheme::secondaryButton(button);
                else DisplayTheme::button(button, bg, fg);
            }
            auto *text = label(button, names[row]);
            lv_obj_center(text);
            setState(button, states[row]);
            const bool disabled = states[row] & LV_STATE_DISABLED;
            const auto expectedBg = disabled ? DisplayTheme::surfaceSecondary() : states[row] & LV_STATE_PRESSED
                ? (column == 0 ? DisplayTheme::primaryPressed() : lv_color_darken(bg, LV_OPA_20)) : bg;
            const auto expectedFg = disabled ? DisplayTheme::muted() : fg;
            samples.emplace_back(button, expectedBg);
            const std::string context = std::string(names[row]) + " column " + std::to_string(column);
            expectColor(lv_obj_get_style_bg_color(button, LV_PART_MAIN), expectedBg, context + " background");
            expectColor(lv_obj_get_style_text_color(button, LV_PART_MAIN), expectedFg, context + " foreground");
            expectColor(lv_obj_get_style_text_color(text, LV_PART_MAIN), expectedFg, context + " label inherits foreground");
            expectFlat(button, DisplayTheme::Radius);
            if (disabled || (states[row] & LV_STATE_PRESSED))
                expect(lv_obj_get_style_color_filter_dsc(button, LV_PART_MAIN) == nullptr, context + " no legacy color filter");
            if (disabled) {
                expect(lv_obj_get_style_border_width(button, LV_PART_MAIN) == 1, context + " disabled border");
                expectColor(lv_obj_get_style_border_color(button, LV_PART_MAIN), DisplayTheme::border(), context + " border color");
            }
            if (states[row] & LV_STATE_FOCUS_KEY) {
                expectColor(lv_obj_get_style_outline_color(button, LV_PART_MAIN), DisplayTheme::primary(), "Focus ring color");
                expect(lv_obj_get_style_outline_width(button, LV_PART_MAIN) > 0, "Visible focus ring width");
                expect(lv_obj_get_style_outline_opa(button, LV_PART_MAIN) > 0, "Visible focus ring opacity");
            }
        }
    }
    renderer.capture(helpers ? "widgets-button-helpers" : "widgets-buttons");
    for (const auto &[button, color] : samples) {
        lv_area_t area;
        lv_obj_get_coords(button, &area);
        renderer.expectPixel(area.x1 + 12, area.y1 + 12, color,
            std::string("Rendered button ") + lv_label_get_text(lv_obj_get_child(button, 0)));
    }
}
