#include "display/theme.hpp"
#include "display/fonts/attractap_fonts.hpp"
#include "display/images/logo_40h.hpp"
#include "display/images/lockscreen_background_image.hpp"
#include "display/screens/lockscreen/lockscreen.hpp"
#include "display/screens/resourceList/resourceListScreen.hpp"
#include "display/screens/noResources/noResourcesScreen.hpp"
#include "display/screens/boot/bootscreen.hpp"
#include "display/screens/init/initscreen.hpp"
#include "display/screens/enrollment/enrollmentScreen.hpp"
#include "display/screens/reset/resetScreen.hpp"
#include "display/screens/supervision/supervisionScreen.hpp"
#include "display/screens/firmwareUpdate/firmwareUpdateScreen.hpp"
#include "display/shared/pinInput/pinInputPage.hpp"
#include "display/shared/powerOff/powerOffButton.hpp"
#include "fixtures.hpp"
#include "display/screens/demoSettings/demoSettingsScreen.hpp"
#include "state/language.hpp"
#include "display/i18n.hpp"
#include "demo/demo_localization.hpp"
#include "display/screens/resourceDetails/resourceDetailsScreen.hpp"

#include <algorithm>
#include <array>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <type_traits>
#include <vector>

static_assert(LVGL_VERSION_MAJOR == 9 && LVGL_VERSION_MINOR == 3 && LVGL_VERSION_PATCH == 0,
              "This harness requires the production LVGL version: 9.3.0");
static_assert(LV_COLOR_DEPTH == 16 && LV_USE_OS == LV_OS_NONE && LV_DRAW_SW_DRAW_UNIT_CNT == 1);
static_assert(LV_USE_STDLIB_MALLOC == LV_STDLIB_CLIB && LV_USE_PERF_MONITOR == 0);

extern const uint8_t smallLogoEnd[] asm("_binary_logo_133x40_rgb565a8_end");
extern const uint8_t largeLogoEnd[] asm("_binary_logo_400x120_rgb565a8_end");
extern const uint8_t backgroundEnd[] asm("_binary_lockscreen_rgb565_end");

namespace
{
unsigned checks = 0;
unsigned lvglErrors = 0;

void expect(bool condition, const std::string &message)
{
    ++checks;
    if (!condition) throw std::runtime_error(message);
}

void expectColor(lv_color_t actual, lv_color_t expected, const std::string &message)
{
    std::ostringstream detail;
    detail << message << ": expected #" << std::hex << std::setw(6) << std::setfill('0')
           << (lv_color_to_u32(expected) & 0xFFFFFF) << ", got #" << std::setw(6) << (lv_color_to_u32(actual) & 0xFFFFFF);
    expect(lv_color_eq(actual, expected), detail.str());
}

void settle()
{
    // Advance LVGL animations, never wall-clock time or the independent firmware clock.
    for (unsigned i = 0; i < 20; ++i) {
        lv_tick_inc(16);
        lv_timer_handler();
    }
}

void setState(lv_obj_t *obj, lv_state_t state)
{
    lv_obj_remove_state(obj, LV_STATE_ANY);
    lv_obj_add_state(obj, state);
    settle();
}

lv_obj_t *findObject(lv_obj_t *root, const lv_obj_class_t *type, const char *text = nullptr)
{
    if (lv_obj_check_type(root, type) && (!text || std::strcmp(lv_label_get_text(root), text) == 0))
        return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *found = findObject(lv_obj_get_child(root, i), type, text)) return found;
    return nullptr;
}

lv_obj_t *requireObject(lv_obj_t *root, const lv_obj_class_t *type, const char *text = nullptr)
{
    auto *obj = findObject(root, type, text);
    if (!obj) {
        const auto dump = [](auto &&self, lv_obj_t *node) -> void {
            if (lv_obj_check_type(node, &lv_label_class)) std::cerr << "LABEL " << lv_label_get_text(node) << '\n';
            for (uint32_t i = 0; i < lv_obj_get_child_count(node); ++i) self(self, lv_obj_get_child(node, i));
        };
        dump(dump, root);
    }
    expect(obj != nullptr, std::string("Missing production widget: ") + (text ? text : "class lookup"));
    return obj;
}

lv_obj_t *label(lv_obj_t *parent, const char *text)
{
    auto *obj = lv_label_create(parent);
    lv_label_set_text(obj, text);
    return obj;
}

struct ScreenGuard
{
    lv_obj_t *home = lv_screen_active();
    lv_obj_t *root;
    IScreen *firmware;

    explicit ScreenGuard(lv_obj_t *root, IScreen *firmware = nullptr) : root(root), firmware(firmware)
    {
        expect(root != nullptr, "Screen initialized");
        lv_screen_load(root);
        if (firmware) {
            const auto count = lv_obj_get_child_count(root);
            firmware->init();
            expect(firmware->getScreen() == root && lv_obj_get_child_count(root) == count,
                   "Production screen init is idempotent");
        }
    }

    ~ScreenGuard()
    {
        lv_screen_load(home);
        if (firmware) {
            firmware->onScreenLeave();
            firmware->destroy();
        } else {
            lv_obj_delete(root);
        }
    }
};

struct Renderer
{
    static constexpr int width = 480;
    static constexpr int height = 480;
    std::vector<uint16_t> drawBuffer = std::vector<uint16_t>(width * height);
    std::vector<uint16_t> pixels = std::vector<uint16_t>(width * height);
    std::filesystem::path output;
    lv_display_t *display;
    unsigned flushes = 0;
    unsigned captures = 0;
    bool validFlush = true;

    explicit Renderer(const std::filesystem::path &output) : output(output)
    {
        if (!output.empty()) std::filesystem::create_directories(output);
        lv_init();
        lv_log_register_print_cb([](lv_log_level_t, const char *message) {
            ++lvglErrors;
            std::cerr << "LVGL: " << message;
        });
        display = lv_display_create(width, height);
        lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
        lv_display_set_buffers_with_stride(display, drawBuffer.data(), nullptr,
            drawBuffer.size() * sizeof(uint16_t), width * sizeof(uint16_t), LV_DISPLAY_RENDER_MODE_FULL);
        lv_display_set_user_data(display, this);
        lv_display_set_flush_cb(display, [](lv_display_t *display, const lv_area_t *area, uint8_t *data) {
            auto &self = *static_cast<Renderer *>(lv_display_get_user_data(display));
            self.validFlush &= area->x1 == 0 && area->y1 == 0 && area->x2 == width - 1 && area->y2 == height - 1;
            if (self.validFlush) std::memcpy(self.pixels.data(), data, self.pixels.size() * sizeof(uint16_t));
            ++self.flushes;
            lv_display_flush_ready(display);
        });
        DisplayTheme::init(display);
    }

    ~Renderer()
    {
        lv_display_delete(display);
        lv_deinit();
    }

    void capture(const std::string &name)
    {
        settle();
        const auto before = flushes;
        lv_obj_invalidate(lv_screen_active());
        lv_refr_now(display);
        expect(validFlush && flushes > before, name + ": real full-frame LVGL flush");
        expect(std::count_if(pixels.begin(), pixels.end(), [&](uint16_t p) { return p != pixels.front(); }) > 100,
               name + ": rendered frame is not blank");

        std::vector<uint8_t> rgba;
        rgba.reserve(pixels.size() * 4);
        for (uint16_t pixel : pixels) {
            const uint8_t r = (pixel >> 11) & 31;
            const uint8_t g = (pixel >> 5) & 63;
            const uint8_t b = pixel & 31;
            rgba.insert(rgba.end(), {static_cast<uint8_t>((r << 3) | (r >> 2)),
                                    static_cast<uint8_t>((g << 2) | (g >> 4)),
                                    static_cast<uint8_t>((b << 3) | (b >> 2)), 255});
        }
        if (!output.empty()) {
            std::ofstream file;
            file.exceptions(std::ios::failbit | std::ios::badbit);
            file.open(output / (name + ".rgba"), std::ios::binary);
            file.write(reinterpret_cast<const char *>(rgba.data()), rgba.size());
            file.close();
        }
        uint64_t hash = 14695981039346656037ULL;
        for (uint8_t byte : rgba) hash = (hash ^ byte) * 1099511628211ULL;
        ++captures;
        std::cout << "RENDER " << name << " 480x480 RGBA fnv1a64=" << std::hex << hash << std::dec << '\n';
    }

    void expectPixel(int x, int y, lv_color_t color, const std::string &message)
    {
        expect(x >= 0 && x < width && y >= 0 && y < height, message + ": sample in framebuffer");
        std::ostringstream detail;
        detail << message << " at (" << x << ',' << y << "): expected RGB565 0x" << std::hex
               << lv_color_to_u16(color) << ", got 0x" << pixels[y * width + x];
        expect(pixels[y * width + x] == lv_color_to_u16(color), detail.str());
    }
};

void expectFlat(lv_obj_t *obj, int32_t radius)
{
    expect(lv_obj_get_style_bg_opa(obj, LV_PART_MAIN) == LV_OPA_COVER, "Opaque background");
    expect(lv_obj_get_style_bg_grad_dir(obj, LV_PART_MAIN) == LV_GRAD_DIR_NONE, "No gradient");
    expect(lv_obj_get_style_shadow_width(obj, LV_PART_MAIN) == 0, "No shadow");
    expect(lv_obj_get_style_radius(obj, LV_PART_MAIN) == radius, "Theme corner radius");
}

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

void testInputs(Renderer &renderer)
{
    std::array<lv_area_t, 4> keyAreas{};
    ScreenGuard screen(lv_obj_create(nullptr));
    auto *field = lv_textarea_create(screen.root);
    lv_textarea_set_one_line(field, true);
    lv_textarea_set_text(field, "Focused field");
    lv_obj_set_pos(field, 24, 24);
    lv_obj_set_size(field, 432, 52);
    expectColor(lv_obj_get_style_border_color(field, LV_PART_MAIN), DisplayTheme::fieldBorder(), "Automatic field border");
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_SELECTED), DisplayTheme::primary(), "Automatic text selection");
    setState(field, LV_STATE_DISABLED);
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_MAIN), DisplayTheme::surfaceSecondary(), "Disabled field background");
    expectColor(lv_obj_get_style_text_color(field, LV_PART_MAIN), DisplayTheme::muted(), "Disabled field text");
    setState(field, LV_STATE_DEFAULT);
    DisplayTheme::field(field);
    expectColor(lv_obj_get_style_text_color(field, LV_PART_TEXTAREA_PLACEHOLDER), DisplayTheme::muted(), "Placeholder color");
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_CURSOR), DisplayTheme::primary(), "Cursor color");
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_SELECTED), DisplayTheme::primarySoft(), "Helper selection background");
    expectColor(lv_obj_get_style_text_color(field, LV_PART_SELECTED), DisplayTheme::onPrimarySoft(), "Helper selection text");
    setState(field, LV_STATE_DISABLED);
    expectColor(lv_obj_get_style_bg_color(field, LV_PART_MAIN), DisplayTheme::surfaceSecondary(), "Disabled helper field background");
    expectColor(lv_obj_get_style_text_color(field, LV_PART_MAIN), DisplayTheme::muted(), "Disabled helper field text");
    setState(field, LV_STATE_FOCUSED);
    expectColor(lv_obj_get_style_border_color(field, LV_PART_MAIN), DisplayTheme::primary(), "Focused helper field border");

    auto *dropdown = lv_dropdown_create(screen.root);
    lv_dropdown_set_options(dropdown, "Option A\nOption B");
    lv_obj_set_pos(dropdown, 24, 94);
    lv_obj_set_width(dropdown, 432);
    setState(dropdown, LV_STATE_FOCUSED);
    expectColor(lv_obj_get_style_border_color(dropdown, LV_PART_MAIN), DisplayTheme::primary(), "Focused dropdown border");
    setState(dropdown, LV_STATE_DISABLED);
    expectColor(lv_obj_get_style_text_color(dropdown, LV_PART_MAIN), DisplayTheme::muted(), "Disabled dropdown text");
    setState(dropdown, LV_STATE_DEFAULT);

    auto *matrix = lv_buttonmatrix_create(screen.root);
    static const char *const map[] = {"Normal", "Press", "Check", "Disabled", ""};
    lv_buttonmatrix_set_map(matrix, map);
    lv_obj_set_pos(matrix, 24, 162);
    lv_obj_set_size(matrix, 432, 72);
    auto *keyboard = lv_keyboard_create(screen.root);
    lv_keyboard_set_mode(keyboard, LV_KEYBOARD_MODE_NUMBER);
    lv_keyboard_set_textarea(keyboard, field);
    lv_obj_set_size(keyboard, 480, 240);
    lv_obj_align(keyboard, LV_ALIGN_BOTTOM_MID, 0, 0);
    for (auto *obj : {matrix, keyboard}) {
        for (bool helper : {false, true}) {
            if (helper) DisplayTheme::keyboard(obj);
            setState(obj, LV_STATE_DEFAULT);
            expectColor(lv_obj_get_style_bg_color(obj, LV_PART_MAIN), DisplayTheme::surfaceSecondary(), "Keyboard background");
            expectColor(lv_obj_get_style_bg_color(obj, LV_PART_ITEMS), DisplayTheme::surface(), "Key background");
            expect(lv_obj_get_style_border_width(obj, LV_PART_ITEMS) == 1, "Key border");
            for (lv_state_t state : {LV_STATE_PRESSED, LV_STATE_CHECKED, LV_STATE_DISABLED}) {
                setState(obj, state);
                const auto bg = state == LV_STATE_PRESSED ? DisplayTheme::primaryPressed()
                    : state == LV_STATE_CHECKED ? DisplayTheme::primary() : DisplayTheme::surfaceSecondary();
                expectColor(lv_obj_get_style_bg_color(obj, LV_PART_ITEMS), bg, "Key state background");
                expectColor(lv_obj_get_style_text_color(obj, LV_PART_ITEMS),
                    state == LV_STATE_DISABLED ? DisplayTheme::muted() : DisplayTheme::onPrimary(), "Key state foreground");
            }
        }
        setState(obj, LV_STATE_DEFAULT);
    }
    // Real button-matrix per-key states, not a drawing made to look like a keyboard.
    lv_buttonmatrix_set_button_ctrl(matrix, 2, LV_BUTTONMATRIX_CTRL_CHECKED);
    lv_buttonmatrix_set_button_ctrl(matrix, 3, LV_BUTTONMATRIX_CTRL_DISABLED);
    lv_buttonmatrix_set_selected_button(matrix, 1);
    setState(matrix, LV_STATE_PRESSED);
    // Observe actual draw-task bounds so samples never depend on guessed key padding.
    lv_obj_add_flag(matrix, LV_OBJ_FLAG_SEND_DRAW_TASK_EVENTS);
    lv_obj_add_event_cb(matrix, [](lv_event_t *event) {
        auto *task = lv_event_get_draw_task(event);
        auto *fill = lv_draw_task_get_fill_dsc(task);
        auto &areas = *static_cast<std::array<lv_area_t, 4> *>(lv_event_get_user_data(event));
        if (fill && fill->base.part == LV_PART_ITEMS && fill->base.id1 < areas.size())
            lv_draw_task_get_area(task, &areas[fill->base.id1]);
    }, LV_EVENT_DRAW_TASK_ADDED, &keyAreas);
    renderer.capture("widgets-inputs");
    const lv_color_t keyColors[] = {DisplayTheme::surface(), DisplayTheme::primaryPressed(),
        DisplayTheme::primary(), DisplayTheme::surfaceSecondary()};
    for (int key = 0; key < 4; ++key) {
        const auto &area = keyAreas[key];
        expect(lv_area_get_width(&area) > 10 && lv_area_get_height(&area) > 20, "Real per-key fill task recorded");
        renderer.expectPixel((area.x1 + area.x2) / 2, area.y1 + 4,
                             keyColors[key], "Rendered matrix key " + std::to_string(key));
    }
}

void testDemoFixtureLocales(Renderer &renderer)
{
    auto *root = lv_obj_create(lv_screen_active());
    lv_obj_set_size(root, 400, 220);
    lv_obj_center(root);
    auto *resource = lv_label_create(root);
    lv_obj_align(resource, LV_ALIGN_TOP_MID, 0, 24);
    auto *project = lv_label_create(root);
    lv_obj_align(project, LV_ALIGN_TOP_MID, 0, 84);

    FirmwareI18n::setDynamicLabel(resource, DemoLocalization::resourceName(1, true));
    FirmwareI18n::setDynamicLabel(project, DemoLocalization::projectName(0, true));
    expect(std::string(lv_label_get_text(resource)) == "CNC Router" &&
               std::string(lv_label_get_text(project)) == "Oak Furniture",
           "English demo resource and project fixtures reach the display labels");
    renderer.capture("demo-english-fixtures");

    FirmwareI18n::setDynamicLabel(resource, DemoLocalization::resourceName(1, false));
    FirmwareI18n::setDynamicLabel(project, DemoLocalization::projectName(0, false));
    expect(std::string(lv_label_get_text(resource)) == "CNC Fraese" &&
               std::string(lv_label_get_text(project)) == "Möbelbau Eiche",
           "German demo resource and project fixtures reach the display labels");
    renderer.capture("demo-german-fixtures");
    lv_obj_delete(root);
}

void testDemoResourceListLocales(Renderer &renderer)
{
    ResourceListScreen list;
    API::ResourceList resources{};
    resources.count = 3;
    std::strcpy(resources.authenticatedUsername, "Demo User");
    for (int i = 0; i < 3; ++i) {
        resources.items[i].id = i + 1;
        resources.items[i].isHealthy = true;
        resources.items[i].accessKnown = true;
        resources.items[i].hasIntroduction = true;
        std::strcpy(resources.items[i].name, DemoLocalization::resourceName(i + 1, false));
    }
    list.setResourceList(resources);
    list.setAuthenticatedUser("Demo User");
    list.setSessionTimeoutTime(Fixtures::nowMs + 30000);
    list.init();
    ScreenGuard screen(list.getScreen(), &list);

    expect(requireObject(screen.root, &lv_label_class, "CNC Fraese") != nullptr,
           "Production demo resource list displays its German CNC fixture");
    expect(requireObject(screen.root, &lv_label_class, "3D Drucker") != nullptr,
           "Production demo resource list displays its German printer fixture");
    requireObject(screen.root, &lv_label_class, "Ressource links: Details · Aktion rechts");
    renderer.capture("demo-resource-list-german");

    for (int i = 0; i < 3; ++i)
        std::strcpy(resources.items[i].name, DemoLocalization::resourceName(i + 1, true));
    std::strcpy(resources.authenticatedUsername, "Demo User");
    list.setResourceList(resources);
    Fixtures::activeLanguage = "en";
    list.loop();
    expect(requireObject(screen.root, &lv_label_class, "CNC Router") != nullptr,
           "Production demo resource list displays its English CNC fixture");
    expect(requireObject(screen.root, &lv_label_class, "3D Printer") != nullptr,
           "Production demo resource list displays its English printer fixture");
    requireObject(screen.root, &lv_label_class, "Resource on the left: details · action on the right");
    renderer.capture("demo-resource-list-english");
}

void testCatalogLocales(Renderer &renderer)
{
    constexpr size_t labelsPerFrame = 12;
    auto *root = lv_obj_create(nullptr);
    lv_obj_set_size(root, Renderer::width, Renderer::height);
    ScreenGuard screen(root);
    for (const char *locale : {"de", "en"}) {
        for (size_t offset = 0; offset < std::size(FirmwareI18n::catalog); offset += labelsPerFrame) {
            lv_obj_clean(root);
            const size_t count = std::min(labelsPerFrame, std::size(FirmwareI18n::catalog) - offset);
            for (size_t i = 0; i < count; ++i) {
                const auto &entry = FirmwareI18n::catalog[offset + i];
                auto *item = lv_label_create(root);
                lv_obj_set_width(item, 220);
                lv_obj_set_height(item, 34);
                lv_obj_set_pos(item, (i % 2) * 230, (i / 2) * 72);
                lv_label_set_long_mode(item, LV_LABEL_LONG_MODE_WRAP);
                const char *rendered = std::strcmp(locale, "en") == 0 ? entry.en : entry.de;
                const char *translated = FirmwareI18n::messageText(entry.id, "en");
                expect(std::strcmp(translated, entry.en) == 0,
                       std::string("English catalog entry translates: ") + entry.de);
                if (std::strcmp(locale, "de") == 0) {
                    const char *reverse = FirmwareI18n::messageText(entry.id, "de");
                    const bool validReverse = std::any_of(std::begin(FirmwareI18n::catalog),
                        std::end(FirmwareI18n::catalog), [&](const auto &candidate) {
                            return std::strcmp(candidate.en, entry.en) == 0 && std::strcmp(candidate.de, reverse) == 0;
                        });
                    expect(validReverse, std::string("German catalog reverse mapping is valid: ") + entry.en);
                }
                lv_label_set_text(item, rendered);
            }
            renderer.capture(std::string("catalog-") + locale + "-" + std::to_string(offset / labelsPerFrame));
        }
    }
}

void testLogos(Renderer &renderer)
{
    ScreenGuard screen(lv_obj_create(nullptr));
    const std::array<const lv_image_dsc_t *, 2> images = {&logo_400w_png, &logo_40h};
    const std::array<const uint8_t *, 2> ends = {largeLogoEnd, smallLogoEnd};
    std::array<lv_obj_t *, 2> objects{};
    for (size_t i = 0; i < images.size(); ++i) {
        expect(reinterpret_cast<uintptr_t>(images[i]->data) % 4 == 0,
               "Embedded RGB565 logo data is word-aligned");
        expect(reinterpret_cast<uintptr_t>(ends[i]) - reinterpret_cast<uintptr_t>(images[i]->data) == images[i]->data_size,
               "Embedded logo byte count matches production descriptor");
        objects[i] = lv_image_create(screen.root);
        lv_image_set_src(objects[i], images[i]);
        lv_obj_align(objects[i], LV_ALIGN_TOP_MID, 0, i == 0 ? 60 : 260);
        expect(images[i]->header.cf == LV_COLOR_FORMAT_RGB565A8, "Production RGB565A8 logo descriptor");
        expect(lv_obj_get_style_image_recolor_opa(objects[i], LV_PART_MAIN) == LV_OPA_TRANSP, "Theme does not recolor logo");
    }
    renderer.capture("production-logos");
    for (size_t i = 0; i < images.size(); ++i) {
        const auto &image = *images[i];
        lv_area_t area;
        lv_obj_get_coords(objects[i], &area);
        expect(area.x1 >= 0 && area.y1 >= 0 && area.x2 < Renderer::width && area.y2 < Renderer::height,
               "Unscaled logo fits framebuffer");
        const uint32_t size = image.header.w * image.header.h;
        unsigned opaque = 0, transparent = 0;
        for (unsigned p = 0; p < size; ++p) {
            const auto alpha = image.data[size * 2 + p];
            const auto rendered = renderer.pixels[(area.y1 + p / image.header.w) * Renderer::width + area.x1 + p % image.header.w];
            if (alpha == 255) {
                uint16_t expected;
                std::memcpy(&expected, image.data + p * 2, sizeof(expected));
                expect(rendered == expected, "Opaque logo pixel preserved by actual renderer");
                ++opaque;
            } else if (alpha == 0) {
                expect(rendered == lv_color_to_u16(DisplayTheme::background()), "Transparent logo pixel composites on dark background");
                ++transparent;
            }
        }
        expect(opaque > 100 && transparent > 100, "Logo has rendered color and transparency");
    }
}

void testBoot(Renderer &renderer)
{
    BootScreen boot;
    boot.init();
    ScreenGuard screen(boot.getScreen(), &boot);
    auto *title = requireObject(screen.root, &lv_label_class, "Attraccess");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::text(), "Boot title color");
    requireObject(screen.root, &lv_label_class, "Attractap Host vtest");
    renderer.capture("boot");
}

void testInit(Renderer &renderer)
{
    InitScreen init;
    init.init();
    ScreenGuard screen(init.getScreen(), &init);
    init.loop();
    requireObject(screen.root, &lv_label_class, "Server: nicht konfiguriert");
    renderer.capture("init-pending");
    Fixtures::network.wifi_connected = true;
    const uint8_t ip[] = {192, 0, 2, 42};
    std::memcpy(&Fixtures::network.wifi_ip.addr, ip, sizeof(ip));
    Fixtures::websocket = {false, "reader.example", 443, true, State::WS_CONNECTING,
                          "Example CA", 1, 3, 0, false, 5};
    Fixtures::nowMs += 1000;
    init.loop();
    auto *wifi = requireObject(screen.root, &lv_label_class, "WLAN  192.0.2.42");
    expectColor(lv_obj_get_style_text_color(wifi, LV_PART_MAIN), DisplayTheme::success(), "Connected network color");
    auto *search = requireObject(screen.root, &lv_label_class, "suche Zertifikat");
    expectColor(lv_obj_get_style_text_color(search, LV_PART_MAIN), DisplayTheme::warning(), "Certificate search warning");
    renderer.capture("init-cert-search");
    FirmwareI18n::refreshTree(screen.root, "en");
    requireObject(screen.root, &lv_label_class, "Wi-Fi  192.0.2.42");
    requireObject(screen.root, &lv_label_class, "Server: reader.example:443  (SSL)");
    renderer.capture("init-cert-search-english");
    FirmwareI18n::refreshTree(screen.root, "de");
    Fixtures::websocket.connected = true;
    Fixtures::websocket.phase = State::WS_CONNECTED;
    Fixtures::api.authenticated = true;
    Fixtures::nowMs += 1000;
    init.loop();
    auto *api = requireObject(screen.root, &lv_label_class, "API verbunden");
    expectColor(lv_obj_get_style_text_color(api, LV_PART_MAIN), DisplayTheme::success(), "API connected color");
    renderer.capture("init-connected");
    bool opened = false;
    init.setOnOpenSettingsCallback([&] { opened = true; });
    lv_obj_send_event(lv_obj_get_parent(requireObject(screen.root, &lv_label_class, "Einstellungen")), LV_EVENT_CLICKED, nullptr);
    expect(opened, "Production settings event callback");
}

template <typename CardScreen>
void testCard(Renderer &renderer, const std::string &name, const char *writing, const char *success)
{
    CardScreen card;
    card.setUserName(Fixtures::userName);
    if constexpr (std::is_same_v<CardScreen, EnrollmentScreen>) card.setEnrollmentTimeoutTime(Fixtures::nowMs + 30000);
    else card.setTimeoutTime(Fixtures::nowMs + 30000);
    card.init();
    ScreenGuard screen(card.getScreen(), &card);
    requireObject(screen.root, &lv_label_class, Fixtures::userName);
    auto *cancel = lv_obj_get_parent(requireObject(screen.root, &lv_label_class, "Abbrechen"));
    auto *bar = requireObject(screen.root, &lv_bar_class);
    bool canceled = false;
    card.setOnCancelCallback([&] { canceled = true; });
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(canceled, name + ": production cancel event callback");
    const std::array<typename CardScreen::Status, 4> states = {CardScreen::STATUS_WAITING, CardScreen::STATUS_WRITING,
        CardScreen::STATUS_SUCCESS, CardScreen::STATUS_ERROR};
    const char *suffix[] = {"waiting", "writing", "success", "error"};
    const char *text[] = {"Karte an den Leser halten", writing, success, Fixtures::errorMessage};
    const lv_color_t colors[] = {DisplayTheme::text(), DisplayTheme::warning(), DisplayTheme::success(), DisplayTheme::danger()};
    for (size_t i = 0; i < states.size(); ++i) {
        card.setStatus(states[i]);
        if (states[i] == CardScreen::STATUS_ERROR) card.setStatusMessage(FirmwareI18n::Text::literal(Fixtures::errorMessage));
        auto *status = requireObject(screen.root, &lv_label_class, text[i]);
        expectColor(lv_obj_get_style_text_color(status, LV_PART_MAIN), colors[i], name + ": status color");
        expect(lv_obj_get_style_text_font(status, LV_PART_MAIN) == &attractap_font_montserrat_latin1_32,
               name + ": server-derived status uses a Latin-1 font");
        expect(lv_obj_has_flag(cancel, LV_OBJ_FLAG_HIDDEN) == (states[i] == CardScreen::STATUS_SUCCESS), name + ": cancel visibility");
        renderer.capture(name + "-" + suffix[i]);
        FirmwareI18n::refreshTree(screen.root, "en");
        requireObject(screen.root, &lv_label_class, Fixtures::userName);
        renderer.capture(name + "-english-" + suffix[i]);
        FirmwareI18n::refreshTree(screen.root, "de");
        expect(lv_bar_get_value(bar) == 30, name + ": fixed 30-second countdown");
    }
    // Keep supplied errors literal above, and separately cover the authored
    // error identifiers used by the production application callbacks.
    card.setStatusMessage(FirmwareI18n::readerError("CARD_NOT_ACTIVE"));
    FirmwareI18n::refreshTree(screen.root, "en");
    requireObject(screen.root, &lv_label_class, "Card is inactive");
    renderer.capture(name + "-english-authored-error");
    FirmwareI18n::refreshTree(screen.root, "de");
    requireObject(screen.root, &lv_label_class, "Karte ist nicht aktiv");
    renderer.capture(name + "-german-authored-error");
    Fixtures::nowMs += 5000;
    card.loop();
    settle();
    expect(lv_bar_get_value(bar) == 25, name + ": countdown advances only with fixture clock");
    Fixtures::nowMs += 30000;
    card.loop();
    settle();
    expect(lv_bar_get_value(bar) == 0, name + ": expired countdown clamps to zero");
}

void testSupervision(Renderer &renderer)
{
    SupervisionScreen supervision;
    SupervisionScreen::View view{Fixtures::nowMs + 30000, Fixtures::userName, FirmwareI18n::Text::literal(Fixtures::errorMessage), FirmwareI18n::Text::literal(Fixtures::supervisorHint)};
    supervision.render(view);
    supervision.init();
    ScreenGuard screen(supervision.getScreen(), &supervision);
    requireObject(screen.root, &lv_label_class, Fixtures::userName);
    auto *hint = requireObject(screen.root, &lv_label_class, Fixtures::supervisorHint);
    expect(lv_obj_get_style_text_font(hint, LV_PART_MAIN) == &attractap_font_montserrat_latin1_18,
           "Supervision hint uses a Latin-1 font");
    auto *cancel = lv_obj_get_parent(requireObject(screen.root, &lv_label_class, "Abbrechen"));
    const std::array<SupervisionScreen::Status, 4> states = {SupervisionScreen::STATUS_WAITING, SupervisionScreen::STATUS_VERIFYING,
        SupervisionScreen::STATUS_SUCCESS, SupervisionScreen::STATUS_ERROR};
    const char *suffix[] = {"waiting", "verifying", "success", "error"};
    const char *text[] = {"Aufsichts-Karte auflegen", "Karte gelesen...\nbitte nicht bewegen", "Freigegeben!", Fixtures::errorMessage};
    const lv_color_t colors[] = {DisplayTheme::text(), DisplayTheme::warning(), DisplayTheme::success(), DisplayTheme::danger()};
    for (size_t i = 0; i < states.size(); ++i) {
        view.status = states[i];
        supervision.render(view);
        auto *status = requireObject(screen.root, &lv_label_class, text[i]);
        expectColor(lv_obj_get_style_text_color(status, LV_PART_MAIN), colors[i], "Supervision status color");
        expect(lv_obj_get_style_text_font(status, LV_PART_MAIN) == &attractap_font_montserrat_latin1_28,
               "Supervision server-derived status uses a Latin-1 font");
        expect(lv_obj_has_flag(cancel, LV_OBJ_FLAG_HIDDEN) == (view.status == SupervisionScreen::STATUS_SUCCESS), "Supervision cancel visibility");
        renderer.capture(std::string("supervision-") + suffix[i]);
        FirmwareI18n::refreshTree(screen.root, "en");
        requireObject(screen.root, &lv_label_class, Fixtures::userName);
        renderer.capture(std::string("supervision-english-") + suffix[i]);
        FirmwareI18n::refreshTree(screen.root, "de");
    }
    view.status = SupervisionScreen::STATUS_ERROR;
    view.statusMessage = FirmwareI18n::readerError("CARD_NOT_ACTIVE");
    view.supervisorHint = FirmwareI18n::Text::format(FirmwareI18n::Message::Breadcrumb, {
        FirmwareI18n::Message::TapSupervisorCardOrApproveInTheAppWebInterface,
        FirmwareI18n::Text::literal("Maintenance %s")});
    supervision.render(view);
    FirmwareI18n::refreshTree(screen.root, "en");
    requireObject(screen.root, &lv_label_class, "Card is inactive");
    requireObject(screen.root, &lv_label_class, "Tap supervisor card or approve in the\napp/web interface\nMaintenance %s");
    renderer.capture("supervision-english-authored-hint");
    FirmwareI18n::refreshTree(screen.root, "de");
    requireObject(screen.root, &lv_label_class, "Karte ist nicht aktiv");
    renderer.capture("supervision-german-authored-hint");
    unsigned canceled = 0;
    supervision.setOnCancelCallback([&] { ++canceled; });
    supervision.armCancelGuard();
    lv_obj_send_event(cancel, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(canceled == 0, "Supervision rejects an early cancel press");
    Fixtures::nowMs += 1001;
    lv_obj_send_event(cancel, LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(canceled == 1, "Supervision accepts a deliberate cancel press after guard");
}

void testPin(Renderer &renderer)
{
    PinInputPage pin;
    ScreenGuard screen(pin.init(FirmwareI18n::Message::DevicePin));
    auto *field = requireObject(screen.root, &lv_textarea_class);
    auto *keyboard = requireObject(screen.root, &lv_keyboard_class);
    auto *title = requireObject(screen.root, &lv_label_class, "Geräte-PIN");
    expect(lv_obj_get_style_text_font(title, LV_PART_MAIN) == &attractap_font_montserrat_latin1_32,
           "Device PIN title preserves its original 32px size");
    lv_font_glyph_dsc_t titleGlyph{};
    expect(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(title, LV_PART_MAIN), &titleGlyph, 0xE4, 0)
               && !titleGlyph.is_placeholder,
           "Device PIN title renders its umlaut without a placeholder");
    expect(lv_keyboard_get_textarea(keyboard) == field, "Production PIN keyboard is bound to field");
    setState(field, LV_STATE_FOCUSED);
    renderer.capture("pin-empty");
    // Drive the real LVGL keyboard callback with its real key map.
    for (char digit : std::string(Fixtures::pin)) {
        uint32_t id = 0;
        while (const char *text = lv_buttonmatrix_get_button_text(keyboard, id)) {
            if (text[0] == digit && text[1] == '\0') break;
            ++id;
        }
        expect(lv_buttonmatrix_get_button_text(keyboard, id) != nullptr, "Numeric key exists");
        lv_buttonmatrix_set_selected_button(keyboard, id);
        lv_obj_send_event(keyboard, LV_EVENT_VALUE_CHANGED, nullptr);
    }
    expect(std::strcmp(lv_textarea_get_text(field), Fixtures::pin) == 0, "Real keyboard enters deterministic PIN");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::text(), "Valid PIN color");
    renderer.capture("pin-valid");
    lv_buttonmatrix_set_selected_button(keyboard, 0);
    lv_buttonmatrix_set_button_ctrl(keyboard, 1, LV_BUTTONMATRIX_CTRL_DISABLED);
    lv_buttonmatrix_set_button_ctrl(keyboard, 2, LV_BUTTONMATRIX_CTRL_CHECKED);
    setState(keyboard, LV_STATE_PRESSED);
    renderer.capture("pin-key-states");
    setState(keyboard, LV_STATE_DEFAULT);
    lv_buttonmatrix_clear_button_ctrl(keyboard, 1, LV_BUTTONMATRIX_CTRL_DISABLED);
    lv_buttonmatrix_clear_button_ctrl(keyboard, 2, LV_BUTTONMATRIX_CTRL_CHECKED);
    unsigned confirmed = 0;
    std::string confirmedPin;
    pin.setOnConfirmCallback([&](const std::string &value) {
        confirmedPin = value;
        ++confirmed;
        return false;
    });
    lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
    expect(confirmedPin == Fixtures::pin, "Production confirm callback receives PIN");
    expect(confirmed == 1 && std::strlen(lv_textarea_get_text(field)) == 0, "PIN confirm clears field");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::danger(), "Rejected PIN color");
    renderer.capture("pin-rejected");
    lv_textarea_set_text(field, "123");
    lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
    expect(confirmed == 1, "Short PIN cannot confirm");
    bool canceled = false;
    pin.setOnCancelCallback([&] { canceled = true; });
    lv_obj_send_event(keyboard, LV_EVENT_CANCEL, nullptr);
    expect(canceled && std::strlen(lv_textarea_get_text(field)) == 0, "PIN cancel callback clears field");
}

void testPowerOffLocales(Renderer &renderer)
{
    auto *root = lv_obj_create(nullptr);
    ScreenGuard guard(root);
    unsigned confirmed = 0;
    auto *button = PowerOffButton::create(root, [&] { ++confirmed; });
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    expect(PowerOffButton::isConfirmVisible(), "Production power-off dialog opens");
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    requireObject(lv_layer_top(), &lv_label_class, "Power off");
    renderer.capture("power-off-english");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    requireObject(lv_layer_top(), &lv_label_class, "Ausschalten");
    renderer.capture("power-off-german");
    auto *cancel = lv_obj_get_parent(requireObject(lv_layer_top(), &lv_label_class, "Abbrechen"));
    lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
    expect(!PowerOffButton::isConfirmVisible() && confirmed == 0, "Cancel does not power off");
    lv_obj_send_event(button, LV_EVENT_CLICKED, nullptr);
    auto *confirm = lv_obj_get_parent(requireObject(lv_layer_top(), &lv_label_class, "Ausschalten"));
    lv_obj_send_event(confirm, LV_EVENT_CLICKED, nullptr);
    expect(!PowerOffButton::isConfirmVisible() && confirmed == 1, "Production confirm callback fires once");
}

void testFormAndProjectLocaleRefresh(Renderer &renderer)
{
    ResourceDetailsScreen details;
    API::ResourceBrief resource{};
    resource.id = 1; resource.isHealthy = true;
    std::strcpy(resource.name, "Maintenance");
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({"Alex", true, true, true, false});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    const auto click = [](lv_obj_t *root, const char *caption) {
        lv_obj_send_event(lv_obj_get_parent(requireObject(root, &lv_label_class, caption)), LV_EVENT_CLICKED, nullptr);
    };
    API::ProjectsOfUserResponse projects{};
    projects.page = 2; projects.limit = 10; projects.total = 50; projects.count = 1;
    projects.items[0] = {42, "Maintenance %s"};
    details.setProjects(projects);
    click(guard.root, "Projekt wählen");
    requireObject(lv_layer_top(), &lv_label_class, "Seite 2 von 5");
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    FirmwareI18n::refreshTree(guard.root, "en");
    requireObject(lv_layer_top(), &lv_label_class, "Page 2 of 5");
    requireObject(lv_layer_top(), &lv_label_class, "Maintenance %s");
    renderer.capture("projects-english-page-two");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    FirmwareI18n::refreshTree(guard.root, "de");
    requireObject(lv_layer_top(), &lv_label_class, "Seite 2 von 5");
    renderer.capture("projects-german-page-two");
    click(lv_layer_top(), "Maintenance %s");
    details.setSelectedProject(42, "Maintenance %s");
    FirmwareI18n::refreshTree(guard.root, "en");
    requireObject(guard.root, &lv_label_class, "Project: Maintenance %s");
    API::ResourceUsageFormRequest request{};
    request.resourceId = 1; request.action = API::ResourceUsageFormActionType::START;
    request.resourceName = "Maintenance"; request.formCount = 1;
    request.forms[0] = {1, "Notes %s", 1};
    details.showFormsModal(request);
    API::ResourceUsageFormFieldsPage page{};
    page.formId = 1; page.fieldCount = 1;
    page.fields[0].id = 5; page.fields[0].name = "Maintenance";
    page.fields[0].type = API::ResourceUsageFormFieldType::TEXT;
    page.fields[0].isRequired = true;
    page.fields[0].options.text.hasPlaceholder = true;
    page.fields[0].options.text.placeholder = "Maintenance";
    details.renderFormField(page, false, true, 2, 3);
    click(lv_layer_top(), "Absenden");
    requireObject(lv_layer_top(), &lv_label_class, "Pflichtfeld");
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    requireObject(lv_layer_top(), &lv_label_class, "Required field");
    requireObject(lv_layer_top(), &lv_label_class, "Please complete before starting\nMaintenance - Notes %s");
    renderer.capture("form-english-validation");
    API::ResourceUsageFormPageResult result{};
    result.formId = 1; result.errorCount = 1;
    result.errors[0].fieldId = 5; result.errors[0].code = "INVALID_NUMBER";
    result.errors[0].message = "Raw diagnostic %s";
    details.showFormPageErrors(result);
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    requireObject(lv_layer_top(), &lv_label_class, "Please enter a valid number");
    renderer.capture("form-server-error-english");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    requireObject(lv_layer_top(), &lv_label_class, "Bitte eine gültige Zahl eingeben");
    renderer.capture("form-server-error-german");
    result.errors[0].code = "UNKNOWN_FIELD";
    details.showFormPageErrors(result);
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    auto *unknownFieldError = requireObject(lv_layer_top(), &lv_label_class, "Eingabe ungültig.");
    renderer.capture("form-unknown-field-german");
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    expect(requireObject(lv_layer_top(), &lv_label_class, "Invalid input.") == unknownFieldError,
           "Known form error binding survives language refresh");
    renderer.capture("form-unknown-field-english");
    for (const auto *code : {"FUTURE_ERROR", ""}) {
        result.errors[0].code = code;
        details.showFormPageErrors(result);
        for (const auto *locale : {"de", "en"}) {
            FirmwareI18n::refreshTree(lv_layer_top(), locale);
            requireObject(lv_layer_top(), &lv_label_class, "Invalid input.");
        }
    }
    click(lv_layer_top(), "Maintenance");
    auto *keyboard = requireObject(lv_layer_top(), &lv_keyboard_class);
    auto *field = lv_keyboard_get_textarea(keyboard);
    expect(field != nullptr, "Production editor connects its textarea");
    expect(std::string(lv_textarea_get_placeholder_text(field)) == "Maintenance", "Server placeholder has literal ownership");
    lv_textarea_set_text(field, "value %s\nMaintenance");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    expect(std::string(lv_textarea_get_text(field)) == "value %s\nMaintenance", "Editor value survives locale change");
    renderer.capture("form-german-editor");
    lv_obj_send_event(keyboard, LV_EVENT_READY, nullptr);
    FirmwareI18n::refreshTree(lv_layer_top(), "en");
    requireObject(lv_layer_top(), &lv_label_class, "value %s\nMaintenance");
    renderer.capture("form-english-entered-preview");
    FirmwareI18n::refreshTree(lv_layer_top(), "de");
    requireObject(lv_layer_top(), &lv_label_class, "value %s\nMaintenance");
    renderer.capture("form-german-entered-preview");
    details.hideFormsModal();
}

void testFirmwareUpdateLocales(Renderer &renderer)
{
    FirmwareUpdateScreen screen;
    screen.setAvailableVersion("2.0.0");
    screen.setProgress(67);
    screen.init();
    ScreenGuard guard(screen.getScreen(), &screen);
    auto *title = requireObject(guard.root, &lv_label_class, "Softwareaktualisierung");
    auto *version = requireObject(guard.root, &lv_label_class, "test -> 2.0.0");
    FirmwareI18n::refreshTree(guard.root, "en");
    expect(std::string(lv_label_get_text(title)) == "Software update",
           "Production firmware update title translates to English");
    expect(std::string(lv_label_get_text(version)) == "test -> 2.0.0",
           "Firmware version supplied by the updater remains unchanged");
    FirmwareI18n::refreshTree(guard.root, "de");
    expect(std::string(lv_label_get_text(version)) == "test -> 2.0.0",
           "Version data is preserved across locale refresh");
    FirmwareI18n::refreshTree(guard.root, "en");
    renderer.capture("firmware-update-english");
    FirmwareI18n::refreshTree(guard.root, "de");
    expect(std::string(lv_label_get_text(title)) == "Softwareaktualisierung",
           "Production firmware update title refreshes to German");
    renderer.capture("firmware-update-german");
}
}

namespace
{
void expectBackground(Renderer &renderer, lv_obj_t *screen, const char *fixture)
{
    expect(lv_obj_get_style_bg_image_src(screen, LV_PART_MAIN) == &lockscreen_background_image,
           "Production screen retains original background descriptor");
    expect(lv_obj_get_style_bg_image_recolor_opa(screen, LV_PART_MAIN) == LV_OPA_TRANSP,
           "Background artwork is not recolored");
    renderer.capture(fixture);
    // Bottom strip is unobscured on all three production layouts.
    for (int x = 0; x < Renderer::width; ++x) {
        uint16_t original;
        std::memcpy(&original, lockscreen_map + (470 * Renderer::width + x) * 2, sizeof(original));
        expect(renderer.pixels[470 * Renderer::width + x] == original, "Original background pixels rendered unchanged");
    }
}

void testBackgroundScreens(Renderer &renderer)
{
    expect(reinterpret_cast<uintptr_t>(lockscreen_map) % 4 == 0, "Background data aligned");
    expect(static_cast<size_t>(backgroundEnd - lockscreen_map) == 480 * 480 * 2, "Background byte count");
    for (const uint32_t glyph : {0x00C4, 0x00D6, 0x00DC, 0x00DF, 0x00E4, 0x00F6, 0x00FC})
    {
        lv_font_glyph_dsc_t descriptor{};
        expect(lv_font_get_glyph_dsc(&attractap_font_montserrat_latin1_18, &descriptor, glyph, 0),
               "Lockscreen font contains each German Latin-1 glyph");
    }
    {
        Lockscreen lock;
        lock.setResourceName("CNC Fräse");
        lock.init();
        ScreenGuard guard(lock.getScreen(), &lock);
        lock.setUsageInfo(false, "", false);
        auto *resourceName = requireObject(guard.root, &lv_label_class, "CNC Fräse");
        auto *backIcon = requireObject(guard.root, &lv_label_class, LV_SYMBOL_LEFT);
        auto *backButton = lv_obj_get_parent(backIcon);
        lv_obj_update_layout(guard.root);
        lv_area_t backBounds; lv_obj_get_coords(backButton, &backBounds);
        expect(backBounds.x1 == 20 && backBounds.y1 == 20, "Icon-only back control occupies the far-left header position");
        lv_font_glyph_dsc_t iconGlyph{};
        expect(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(backIcon, LV_PART_MAIN), &iconGlyph, 0xf053, 0),
               "Back control uses the real bundled chevron icon glyph");
        expect(lv_obj_get_style_text_font(resourceName, LV_PART_MAIN) == &attractap_font_montserrat_latin1_18,
               "Lockscreen resource name uses a Latin-1 font");
        expectBackground(renderer, guard.root, "lockscreen-available");
        Fixtures::activeLanguage = "en";
        lock.loop();
        requireObject(guard.root, &lv_label_class, "Tap your RFID \n        card/tag to sign in");
        requireObject(guard.root, &lv_label_class, "Available");
        renderer.capture("lockscreen-english-available");
        lock.setUsageInfo(true, "Müller", false);
        auto *usage = requireObject(guard.root, &lv_label_class, "In use: Müller");
        expect(lv_obj_get_style_text_font(usage, LV_PART_MAIN) == &attractap_font_montserrat_latin1_18,
               "Lockscreen active username uses a Latin-1 font");
        lock.setUsageInfo(false, "", true);
        requireObject(guard.root, &lv_label_class, "Under maintenance");
        Fixtures::activeLanguage = "de";
        lock.loop();
        requireObject(guard.root, &lv_label_class, "Bitte mit RFID \n        Karte/Tag anmelden");
        requireObject(guard.root, &lv_label_class, "In Wartung");
        expectBackground(renderer, guard.root, "lockscreen-in-use");
        expectBackground(renderer, guard.root, "lockscreen-maintenance");
    }
    {
        NoResourcesScreen empty;
        empty.init();
        ScreenGuard guard(empty.getScreen(), &empty);
        expectBackground(renderer, guard.root, "no-resources");
    }
    {
        ResourceListScreen list;
        API::ResourceList resources{};
        resources.count = 3;
        const char *names[] = {"Lasercutter", "CNC Fraese", "3D Drucker"};
        for (int i = 0; i < 3; ++i) {
            resources.items[i].id = i + 1;
            std::strcpy(resources.items[i].name, names[i]);
            resources.items[i].description = "Werkstatt";
        }
        resources.items[1].hasActiveUsage = true;
        resources.items[2].isUnderMaintenance = true;
        list.setResourceList(resources);
        list.init();
        ScreenGuard guard(list.getScreen(), &list);
        expectBackground(renderer, guard.root, "resource-list");
        uint32_t selected = 0;
        list.setResourceSelectionCallback([&](const API::ResourceBrief &resource) { selected = resource.id; });
        lv_obj_send_event(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Lasercutter")), LV_EVENT_CLICKED, nullptr);
        expect(selected == 1, "Resource selection callback survives background restoration");
    }
}
void testAuthenticatedList(Renderer &renderer)
{
    ResourceListScreen list;
    API::ResourceList resources{};
    resources.count = 4;
    std::strcpy(resources.authenticatedUsername, "Alex Example");
    const char *names[] = {"Lasercutter", "Maintenance", "Werkstatttür", "3D Drucker"};
    for (int i = 0; i < 4; ++i) {
        auto &resource = resources.items[i];
        resource.id = i + 1;
        std::strcpy(resource.name, names[i]);
        resource.description = i == 1 ? "Maintenance" : "Werkstatt";
        resource.isHealthy = true;
        resource.accessKnown = true;
        resource.hasIntroduction = true;
    }
    resources.items[1].hasActiveUsage = true;
    std::strcpy(resources.items[1].activeUser, "Alex Example");
    resources.items[2].type = 1;
    resources.items[3].hasIntroduction = false;
    list.setResourceList(resources);
    list.setAuthenticatedUser("Alex Example");
    list.setSessionTimeoutTime(Fixtures::nowMs + 30000);
    list.init();
    ScreenGuard guard(list.getScreen(), &list);
    renderer.capture("att-880-authenticated-list");
    auto *logout = lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Abmelden"));
    setState(logout, LV_STATE_PRESSED);
    expect(lv_obj_get_style_transform_width(logout, LV_PART_MAIN) == 0 &&
           lv_obj_get_style_transform_height(logout, LV_PART_MAIN) == 0,
           "Pressed logout stays inside the header without clipping");
    setState(logout, LV_STATE_DEFAULT);
    auto *time = requireObject(guard.root, &lv_label_class, "30 s");
    expect(lv_obj_get_y(logout) == lv_obj_get_y(lv_obj_get_parent(time)), "Logout and countdown share one header row");
    auto *logo = requireObject(guard.root, &lv_image_class);
    expect(lv_obj_has_flag(logo, LV_OBJ_FLAG_HIDDEN), "Signed-in logo is hidden");
    for (int i = 0; i < 4; ++i) {
        auto *left = lv_obj_get_parent(requireObject(guard.root, &lv_label_class, names[i]));
        auto *row = lv_obj_get_parent(left);
        expect(lv_obj_get_child_count(row) == 2, "Every row has two halves");
        auto *right = lv_obj_get_child(row, 1);
        expect(lv_obj_get_width(left) == lv_obj_get_width(right), "Equal split widths");
        lv_area_t l, r; lv_obj_get_coords(left, &l); lv_obj_get_coords(right, &r);
        expect(l.x2 + 1 == r.x1, "Flush split without a middle gap");
        expect(r.x2 < 480 && l.x1 >= 0, "Both halves fit the display");
        expect(lv_obj_get_style_radius(left, 0) == 0 && lv_obj_get_style_radius(right, 0) == 0, "No inner radii");
    }
    uint32_t opened = 0, acted = 0;
    ResourceListAction action = ResourceListAction::None;
    unsigned logouts = 0;
    list.setResourceSelectionCallback([&](const auto &resource) { opened = resource.id; });
    list.setActionCallback([&](const auto &resource, auto value) { acted = resource.id; action = value; });
    list.setLogoutCallback([&] { ++logouts; });
    const auto click = [&](const char *caption) {
        lv_obj_send_event(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, caption)), LV_EVENT_CLICKED, nullptr);
    };
    click("Lasercutter"); expect(opened == 1 && acted == 0, "Left opens details only");
    click("Stop"); expect(acted == 2 && action == ResourceListAction::Stop, "Stop targets its exact row");
    click("Öffnen"); expect(acted == 3 && action == ResourceListAction::OpenDoor, "Door action targets its exact row");
    click("Einweisung"); expect(acted == 3, "Missing introduction blocks a direct event too");
    list.showActionProgress(FirmwareI18n::Message::StartingUsage, FirmwareI18n::Text::literal("Lasercutter"));
    list.setSessionTimeoutPaused(true);
    renderer.capture("att-880-action-pending");
    auto *overlay = lv_obj_get_child(guard.root, -1);
    lv_area_t area; lv_obj_get_coords(overlay, &area);
    expect(area.x1 == 0 && area.y1 == 0 && area.x2 == 479 && area.y2 == 479, "Loading overlay covers the entire input surface");
    click("Start"); click("Maintenance"); click("Abmelden");
    expect(acted == 3 && opened == 1 && logouts == 0, "Pending action blocks actions, navigation and logout");
    Fixtures::nowMs += 45000;
    list.loop();
    requireObject(guard.root, &lv_label_class, "Pausiert");
    list.extendSessionTimeoutBy(45000);
    list.setSessionTimeoutPaused(false);
    list.hideActionProgress();
    requireObject(guard.root, &lv_label_class, "30 s");
    resources.items[0].hasActiveUsage = true;
    std::strcpy(resources.items[0].activeUser, "Alex Example");
    list.setResourceList(resources);
    list.showSuccessToast(FirmwareI18n::Message::UsageStarted);
    renderer.capture("att-880-action-complete");
    resources.items[0].hasActiveUsage = false;
    resources.items[0].requiresSupervisor = true;
    resources.items[1].isUnderMaintenance = true;
    std::strcpy(resources.items[1].activeUser, "Robin");
    resources.items[2].isHealthy = false;
    list.setResourceList(resources);
    renderer.capture("att-880-access-states");
    click("Aufsicht"); expect(acted == 1 && action == ResourceListAction::Supervision, "Supervisor requirement routes explicitly");
    std::strcpy(resources.authenticatedUsername, "Someone else");
    list.setResourceList(resources);
    click("Laden ..."); expect(acted == 1, "Another card's permissions cannot enable an action");
    renderer.capture("att-880-access-refresh");
    list.setSessionTimeoutTime(Fixtures::nowMs + 4000);
    renderer.capture("att-880-session-expiring");
    click("Abmelden"); expect(logouts == 1, "Logout re-enabled after action completion");
    list.setAuthenticatedUser("");
    renderer.capture("att-880-signed-out-list");
    expect(!lv_obj_has_flag(logo, LV_OBJ_FLAG_HIDDEN), "Logout restores logo");
    expect(resources.items[1].hasActiveUsage, "Reader logout leaves usage state intact");

    // Policy boundary cases that must stay consistent as live list data changes.
    API::ResourceBrief resource{};
    resource.accessKnown = true; resource.isHealthy = true; resource.hasIntroduction = true;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Start, "Introduced user can start");
    resource.isUnderMaintenance = true;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::None, "Maintenance blocks ordinary starts");
    resource.canManageMaintenance = true;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Start, "Maintenance permission follows backend policy");
    resource.canManageMaintenance = false; resource.hasIntroduction = false;
    resource.hasActiveUsage = true; std::strcpy(resource.activeUser, "Alex");
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Stop, "Owner can stop despite revoked access/maintenance");
    resource.isUnderMaintenance = false; resource.hasIntroduction = true; resource.allowTakeOver = true;
    std::strcpy(resource.activeUser, "Robin");
    expect(resourceListAction(resource, "Alex") == ResourceListAction::Takeover, "Foreign session requires explicit takeover");
    resource.allowTakeOver = false;
    expect(resourceListAction(resource, "Alex") == ResourceListAction::None, "Foreign usage is never a quick stop");
}

void testUsageStatsExpiry(Renderer &renderer)
{
    ResourceDetailsScreen details;
    API::ResourceBrief resource{};
    resource.id = 1;
    resource.hasActiveUsage = true;
    resource.activeUsageId = 99;
    resource.isHealthy = true;
    resource.accessKnown = true;
    resource.hasIntroduction = true;
    std::strcpy(resource.name, "Lasercutter");
    std::strcpy(resource.activeUser, Fixtures::userName);
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({Fixtures::userName, false, true, false, false});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    API::UsageStats stats{};
    stats.resourceId = 1;
    stats.usageId = 99;
    stats.meters = {{"Energy (kWh)", "0.125", 30, "0,30 EUR"}, {"Heartbeats", "3", 0, "0,00 EUR"}};
    stats.operatingDurationMs = 60000;
    stats.isOperating = 1;
    const auto receivedAt = Fixtures::nowMs;
    details.setUsageStats(stats);
    Fixtures::nowMs = receivedAt + 24999;
    details.loop();
    requireObject(guard.root, &lv_label_class, "Energy (kWh): 0.125\n0,30 EUR / Wert\nHeartbeats: 3\n0,00 EUR / Wert");
    requireObject(guard.root, &lv_label_class, "00:01:00 · Läuft");
    renderer.capture("usage-stats-meters");
    FirmwareI18n::refreshTree(guard.root, "en");
    requireObject(guard.root, &lv_label_class, "Current usage");
    requireObject(guard.root, &lv_label_class, "00:01:00 · Running");
    renderer.capture("usage-stats-meters-english");
    FirmwareI18n::refreshTree(guard.root, "de");
    Fixtures::nowMs = receivedAt + 25000;
    details.loop();
    requireObject(guard.root, &lv_label_class, "Warte auf Messwert");
    requireObject(guard.root, &lv_label_class, "Keine Daten");
    expect(!findObject(guard.root, &lv_label_class, "Heartbeats: 0"), "Expired consumption is unavailable, not zero");
    renderer.capture("usage-stats-expired");
    stats.meters = {{"Heartbeats", "0", 0, "0,00 EUR"}};
    stats.isOperating = 0;
    details.setUsageStats(stats);
    requireObject(guard.root, &lv_label_class, "Heartbeats: 0\n0,00 EUR / Wert");
    requireObject(guard.root, &lv_label_class, "00:01:00 · Leerlauf");
    renderer.capture("usage-stats-recovered");
}

void testIntroducerDetails(Renderer &renderer)
{
    ResourceDetailsScreen details;
    API::ResourceBrief resource{};
    std::strcpy(resource.name, "Lathe");
    resource.isHealthy = true;
    resource.accessKnown = true;
    std::string expected;
    for (int i = 1; i <= 30; ++i) {
        const auto name = "Tutor " + std::to_string(i) + " with a long display name" +
                          (i == 30 ? " that needs to wrap onto another line" : "");
        resource.introducers.push_back(name);
        if (i > 1) expected += "\n";
        expected += name;
    }
    details.setResourceAndUsageDetails(resource);
    details.setUserDetails({"Learner", false, false, false, false});
    details.init();
    ScreenGuard guard(details.getScreen(), &details);
    for (bool occupied : {false, true}) {
        resource.hasActiveUsage = occupied;
        std::strcpy(resource.activeUser, "Someone else");
        details.setResourceAndUsageDetails(resource);
        settle();
        auto *list = requireObject(guard.root, &lv_label_class, expected.c_str());
        auto *panel = lv_obj_get_parent(list);
        expect(!lv_obj_has_flag(panel, LV_OBJ_FLAG_HIDDEN), "Introduction panel remains visible with occupancy");
        expect(lv_obj_has_flag(guard.root, LV_OBJ_FLAG_SCROLLABLE), "Long list can be scrolled on reader");
        renderer.capture(occupied ? "introducers-occupied-top" : "introducers-available-top");
        lv_obj_scroll_to_y(guard.root, LV_COORD_MAX, LV_ANIM_OFF);
        settle();
        lv_area_t bounds;
        lv_obj_get_coords(list, &bounds);
        expect(bounds.y2 < 480 && bounds.y2 > 0, "Last tutor is reachable by scrolling");
        expect(lv_obj_get_width(list) <= lv_obj_get_content_width(panel), "Long names wrap inside the panel");
        renderer.capture(occupied ? "introducers-occupied-bottom" : "introducers-available-bottom");
        details.showActionProgress(FirmwareI18n::Message::PleaseWait);
        settle();
        auto *overlay = lv_obj_get_child(guard.root, -1);
        const auto expectOverlayCoverage = [&] {
            lv_area_t area;
            lv_obj_get_coords(overlay, &area);
            expect(area.x1 == 0 && area.y1 == 0 && area.x2 == 479 && area.y2 == 479,
                   "Pending action covers the viewport even when details are scrolled");
            expect(lv_obj_has_flag(overlay, LV_OBJ_FLAG_CLICKABLE), "Pending overlay intercepts input");
        };
        expectOverlayCoverage();
        renderer.capture(occupied ? "introducers-occupied-pending" : "introducers-available-pending");
        lv_obj_scroll_to_y(guard.root, 0, LV_ANIM_OFF);
        settle();
        expectOverlayCoverage();
        details.hideActionProgress();
        expect(lv_obj_has_flag(overlay, LV_OBJ_FLAG_HIDDEN), "Completed action hides its overlay");
    }
    resource.introducers = {"Updated tutor"};
    details.setResourceAndUsageDetails(resource);
    settle();
    requireObject(guard.root, &lv_label_class, "Updated tutor");
    expect(!findObject(guard.root, &lv_label_class, expected.c_str()), "Refresh replaces old introducers");
}

}

int main(int argc, char **argv)
{
    std::filesystem::path output;
    if (argc == 2 && std::string(argv[1]) == "--help") {
        std::cout << "Usage: display-theme-host [--output DIR]\nWrites optional 480x480, top-down, packed RGBA8 .rgba files.\n";
        return 0;
    }
    if (argc == 3 && std::string(argv[1]) == "--output") output = argv[2];
    else if (argc != 1) {
        std::cerr << "Usage: display-theme-host [--output DIR]\n";
        return 2;
    }
    try {
        Renderer renderer(output);
        unsigned passed = 0, failed = 0;
        const auto test = [&](const char *name, auto run) {
            Fixtures::activeLanguage = "de";
            Fixtures::nowMs = 1000;
            Fixtures::network = {};
            Fixtures::websocket = {};
            Fixtures::api = {};
            const auto errorsBefore = lvglErrors;
            try {
                run();
                expect(lvglErrors == errorsBefore, "No LVGL error logs");
                ++passed;
                std::cout << "PASS " << name << '\n';
            } catch (const std::exception &error) {
                ++failed;
                std::cerr << "FAIL " << name << ": " << error.what() << '\n';
            }
        };
        test("render/latin1-all-sizes", [&] { testLatin1Fonts(renderer); });
        test("theme/surfaces-and-font", [&] { testSurfaces(renderer); });
        test("theme/automatic-button-states", [&] { testButtons(renderer, false); });
        test("theme/helper-button-states", [&] { testButtons(renderer, true); });
        test("theme/fields-and-keyboard-states", [&] { testInputs(renderer); });
        test("i18n/explicit-bindings-and-data-ownership", [&] {
            using FirmwareI18n::Message;
            using FirmwareI18n::Text;
            expect(Language::supported(" DE_at ") == "de", "Legacy regional locale normalizes");
            for (const auto *german : {"de-Latn-DE", "de-DE-u-co-phonebk", "de-CH-1901", "de-Latn-CH-1996-u-ca-gregory", "de-DE-x-reader", "de-a-foo-b-bar", "de-DE-extra", "de-1234"})
                expect(Language::supported(german) == "de", "Complete German locales normalize");
            for (const auto *invalid : {"de-", "de-!!!", "de--DE", "de_DE_extraextra", "de-Latn-DE-!", "de-DE-Latn", "de-abc", "de-u", "de-u-x-private", "de-x", "de-1901-1901", "de-u-co-phonebk-u-ca-gregory", "", "fr-CA"})
                expect(Language::supported(invalid) == "en", "Invalid or unsupported locales fall back to English");
            for (const auto *german : {"de-u-foo-ca-gregory-kn", "de-u-1a", "de-u-kn", "de-t-en", "de-t-en-US-h0-hybrid", "de-t-h0-hybrid", "de-t-zh-Hant-TW-m0-ungegn-u-ca-gregory-x-reader", "de-t-en-US-1901", "de-u-ca-gregory-ca-buddhist", "de-t-h0-abc-h0-def", "de-x-u-ca-ca-12"})
                expect(Language::supported(german) == "de", std::string("Valid locale extension: ") + german);
            for (const auto *invalid : {"de-u-12", "de-u-a1", "de-u-foo-12", "de-u-ca-gregory-12", "de-t-12", "de-t-h0", "de-t-en-h0", "de-t-en-12", "de-t-abcd", "de-t-en-US-ca-gregory", "de-t-en-US-1901-1901", "de-t-h0-abc-12", "de-u-ca-ca-12", "de-u-kn-kn-a1"})
                expect(Language::supported(invalid) == "en", std::string("Malformed locale extension: ") + invalid);
            Language::Session session;
            session.setApi(true, "en");
            session.setUser(true, "de-AT");
            session.setDefault("de");
            expect(session.active() == "de", "Active user survives default update");
            session.setUser(true, "");
            expect(session.active() == "en", "Authenticated user with missing locale uses English");
            session.setApi(false, "");
            expect(session.active() == "de", "API loss reveals latest retained default");
            expect(std::string(Language::text("English fallback", "", "de")) == "English fallback", "Missing German translation uses English");
            expect(std::string(FirmwareI18n::messageText(static_cast<Message>(9999), "de")) == "Something went wrong. Please try again.", "Missing identifier has safe English fallback");
            expect(FirmwareI18n::readerError("unknown diagnostic").render("de") == "Something went wrong. Please try again.", "Unknown reader errors use English fallback");
            auto *root = lv_obj_create(lv_screen_active());
            auto *caption = lv_label_create(root);
            FirmwareI18n::setLabel(caption, Message::Loading);
            FirmwareI18n::setLabel(caption, Text::format(Message::Pagination, {Text::literal("2"), Text::literal("5")}));
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_label_get_text(caption)) == "Page 2 of 5", "Pagination replaces loading binding");
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_label_get_text(caption)) == "Seite 2 von 5", "Pagination retains current page on reverse refresh");
            const std::string name = "Maintenance %s\nSeite 2 von 5 {0}";
            auto *project = lv_label_create(root);
            FirmwareI18n::setLabel(project, Text::format(Message::ProjectName, {Text::literal(name)}));
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_label_get_text(project)) == "Project: " + name, "Data arguments preserve percent signs, newlines and catalog-like text");
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_label_get_text(project)) == "Projekt: " + name, "Reverse refresh preserves complete supplied names");
            FirmwareI18n::setDynamicLabel(project, "Maintenance");
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_label_get_text(project)) == "Maintenance", "Literal replacement unregisters old message");
            auto *field = lv_textarea_create(root);
            FirmwareI18n::setPlaceholder(field, Message::AtLeast4Digits);
            lv_textarea_set_text(field, "12%\n34");
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_textarea_get_placeholder_text(field)) == "At least 4 digits", "Registered placeholder translates");
            FirmwareI18n::setDynamicPlaceholder(field, "Maintenance");
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_textarea_get_placeholder_text(field)) == "Maintenance", "Server hint stays literal");
            expect(std::string(lv_textarea_get_text(field)) == "12%\n34", "Entered text survives refresh");
            FirmwareI18n::setDynamicPlaceholder(field, "0000");
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_textarea_get_placeholder_text(field)) == "0000", "PIN numeric placeholder stays literal");
            auto *dropdown = lv_dropdown_create(root);
            FirmwareI18n::setDropdownOptions(dropdown, Message::SearchingForWiFiNetworks);
            FirmwareI18n::refreshTree(root, "en");
            expect(std::string(lv_dropdown_get_options(dropdown)) == "Searching for Wi-Fi networks...", "Registered dropdown translates");
            FirmwareI18n::setDynamicDropdownOptions(dropdown, "Maintenance\nWartung");
            lv_dropdown_set_selected(dropdown, 1);
            FirmwareI18n::refreshTree(root, "de");
            expect(std::string(lv_dropdown_get_options(dropdown)) == "Maintenance\nWartung" && lv_dropdown_get_selected(dropdown) == 1, "Network options and selection stay literal");
            std::vector<lv_obj_t *> many;
            for (unsigned i = 0; i < 300; ++i) { auto *label = lv_label_create(root); FirmwareI18n::setLabel(label, Message::Settings); many.push_back(label); }
            FirmwareI18n::refreshTree(root, "en");
            for (auto *label : many) expect(std::string(lv_label_get_text(label)) == "Settings", "Every label refreshes beyond former registration limit");
            lv_obj_delete(root);
            expect(!FirmwareI18n::bindings.count(caption) && !FirmwareI18n::bindings.count(field), "Deletion releases registration and formatting arguments");
        });
        test("demo/production-settings-and-role-picker", [&] {
            DemoSettingsScreen demo;
            demo.init();
            ScreenGuard guard(demo.getScreen(), &demo);
            settle();
            requireObject(guard.root, &lv_label_class, "Maintenance");
            requireObject(guard.root, &lv_label_class, "Kein Zugang ");
            auto *cardholder = requireObject(guard.root, &lv_label_class, "Alex Müller");
            lv_font_glyph_dsc_t glyph{};
            expect(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(cardholder, LV_PART_MAIN), &glyph, 0x00FC, 0) &&
                       !glyph.is_placeholder,
                   "Production demo cardholder name renders its supplied German glyph");
            lv_area_t headingBounds, actionBounds;
            lv_obj_get_coords(requireObject(guard.root, &lv_label_class, "Demo Einstellungen"), &headingBounds);
            lv_obj_get_coords(lv_obj_get_parent(requireObject(guard.root, &lv_label_class, "Karte hinzufügen")), &actionBounds);
            expect(headingBounds.y2 < actionBounds.y1 || headingBounds.x2 < actionBounds.x1,
                   "Translated demo heading does not overlap its action controls");
            renderer.capture("demo-settings-german");
            FirmwareI18n::refreshTree(guard.root, "en");
            requireObject(guard.root, &lv_label_class, "Maintenance");
            requireObject(guard.root, &lv_label_class, "No access ");
            requireObject(guard.root, &lv_label_class, "Alex Müller");
            renderer.capture("demo-settings-english");
            unsigned scansStarted = 0, scansCancelled = 0;
            demo.setStartScanCallback([&] { ++scansStarted; });
            demo.setCancelScanCallback([&] { ++scansCancelled; });
            for (const char *language : {"en", "de"}) {
                Fixtures::activeLanguage = language;
                FirmwareI18n::refreshTree(guard.root, language);
                const bool english = std::string(language) == "en";
                auto *add = lv_obj_get_parent(requireObject(guard.root, &lv_label_class,
                                                          english ? "Add card" : "Karte hinzufügen"));
                const unsigned started = scansStarted, cancelled = scansCancelled;
                lv_obj_send_event(add, LV_EVENT_CLICKED, nullptr);
                expect(demo.isWaitingForCard() && scansStarted == started + 1,
                       "Add card starts the production NFC scan callback");
                // Refresh the open overlay in both directions before cancelling.
                FirmwareI18n::refreshTree(guard.root, english ? "de" : "en");
                FirmwareI18n::refreshTree(guard.root, language);
                auto *prompt = requireObject(guard.root, &lv_label_class,
                                            english ? "Hold card to reader..." : "Karte ans Lesegerät halten...");
                renderer.capture(english ? "demo-scan-cancel-english" : "demo-scan-cancel-german");
                auto *cancel = lv_obj_get_parent(requireObject(lv_obj_get_parent(prompt), &lv_label_class,
                                                             english ? "Cancel" : "Abbrechen"));
                lv_obj_send_event(cancel, LV_EVENT_CLICKED, nullptr);
                expect(!demo.isWaitingForCard() && scansCancelled == cancelled + 1,
                       "Cancel closes the scan and invokes the production NFC cancellation callback once");
                expect(findObject(guard.root, &lv_label_class,
                                  english ? "Hold card to reader..." : "Karte ans Lesegerät halten...") == nullptr,
                       "Cancelled scan overlay is removed and Add card is reachable again");
            }
            // Role selection and direct deletion preserve existing demo behavior;
            // the base revision has no role-picker Cancel or delete confirmation.
            // Production role-picker callback receives a supplied UID.
            demo.onCardScanned("11223344");
            FirmwareI18n::refreshTree(guard.root, "en");
            requireObject(guard.root, &lv_label_class, "Role for card 11223344");
            requireObject(guard.root, &lv_label_class, "Introduced");
            renderer.capture("demo-role-picker-english");
            FirmwareI18n::refreshTree(guard.root, "de");
            requireObject(guard.root, &lv_label_class, "Rolle für Karte 11223344");
            requireObject(guard.root, &lv_label_class, "Eingewiesen");
            renderer.capture("demo-role-picker-german");
        });
        test("demo/fixture-locales", [&] { testDemoFixtureLocales(renderer); });
        test("demo/production-resource-list-locales", [&] { testDemoResourceListLocales(renderer); });
        test("i18n/catalog-bilingual-rendering", [&] { testCatalogLocales(renderer); });
        test("render/production-logo-bytes", [&] { testLogos(renderer); });
        test("screen/att-880-authenticated-list", [&] { testAuthenticatedList(renderer); });
        test("screen/restored-backgrounds", [&] { testBackgroundScreens(renderer); });
        test("screen/boot", [&] { testBoot(renderer); });
        test("screen/init", [&] { testInit(renderer); });
        test("screen/enrollment", [&] { testCard<EnrollmentScreen>(renderer, "enrollment", "Karte wird beschrieben...\nbitte nicht bewegen", "Karte registriert!"); });
        test("i18n/enrollment-locale-transition", [&] {
            EnrollmentScreen card;
            card.init();
            ScreenGuard screen(card.getScreen(), &card);
            requireObject(screen.root, &lv_label_class, "Karte an den Leser halten");
            Fixtures::activeLanguage = "en";
            card.loop();
            requireObject(screen.root, &lv_label_class, "Hold card to reader");
            requireObject(screen.root, &lv_label_class, "Register new card");
            renderer.capture("enrollment-english-waiting");
            card.setStatus(EnrollmentScreen::STATUS_WRITING);
            requireObject(screen.root, &lv_label_class, "Writing card...\nplease keep it still");
            renderer.capture("enrollment-english-writing");
            Fixtures::activeLanguage = "de";
            card.loop();
            requireObject(screen.root, &lv_label_class, "Karte wird beschrieben...\nbitte nicht bewegen");
            renderer.capture("enrollment-german-writing");
        });
        test("screen/reset", [&] { testCard<ResetScreen>(renderer, "reset", "Karte zurücksetzen...\nbitte nicht bewegen", "Karte zurückgesetzt!"); });
        test("screen/supervision", [&] { testSupervision(renderer); });
        test("screen/introducer-details", [&] { testIntroducerDetails(renderer); });
        test("screen/usage-stats-expiry", [&] { testUsageStatsExpiry(renderer); });
        test("screen/pin-and-real-keyboard-events", [&] { testPin(renderer); });
        test("screen/power-off-bilingual", [&] { testPowerOffLocales(renderer); });
        test("screen/forms-and-projects-locale-refresh", [&] { testFormAndProjectLocaleRefresh(renderer); });
        test("screen/firmware-update-bilingual", [&] { testFirmwareUpdateLocales(renderer); });
        std::cout << "RESULT " << passed << " passed, " << failed << " failed; " << checks << " checks; "
                  << renderer.captures << " real LVGL frames\n";
        std::cout << "COVERAGE: production theme, boot/init/enrollment/reset/supervision/PIN, lockscreen/resource list/no resources and image assets.\n"
                     "NOT COVERED: devices, RTOS, transport, full router/overlays, remaining screens or pixel-golden approval.\n";
        if (!output.empty()) std::cout << "OUTPUT " << std::filesystem::absolute(output) << '\n';
        return failed || lvglErrors ? 1 : 0;
    } catch (const std::exception &error) {
        std::cerr << "Harness error: " << error.what() << '\n';
        return 2;
    }
}
