#include "display/theme.hpp"
#include "display/images/logo_40h.hpp"
#include "display/screens/boot/bootscreen.hpp"
#include "display/screens/init/initscreen.hpp"
#include "display/screens/enrollment/enrollmentScreen.hpp"
#include "display/screens/reset/resetScreen.hpp"
#include "display/screens/supervision/supervisionScreen.hpp"
#include "display/shared/pinInput/pinInputPage.hpp"
#include "fixtures.hpp"

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

void testSurfaces(Renderer &renderer)
{
    expectColor(DisplayTheme::primary(), lv_color_hex(0x256D7B), "Brand primary token");
    expectColor(DisplayTheme::background(), lv_color_white(), "White screen token");
    expectColor(lv_obj_get_style_bg_color(lv_screen_active(), LV_PART_MAIN), DisplayTheme::background(),
                "init themes the already-created active screen");
    ScreenGuard screen(lv_obj_create(nullptr));
    expectFlat(screen.root, 0);
    expect(lv_obj_get_style_border_width(screen.root, LV_PART_MAIN) == 0, "Screen has no border");
    auto *title = label(screen.root, "Production theme: surfaces");
    lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 24);
    expect(lv_obj_get_style_text_font(title, LV_PART_MAIN) == &lv_font_montserrat_18, "Inherited 18px font");
    expectColor(lv_obj_get_style_text_color(title, LV_PART_MAIN), DisplayTheme::text(), "Inherited body text");
    auto *surface = lv_obj_create(screen.root);
    lv_obj_set_size(surface, 400, 140);
    lv_obj_center(surface);
    expectFlat(surface, DisplayTheme::Radius);
    expectColor(lv_obj_get_style_border_color(surface, LV_PART_MAIN), DisplayTheme::border(), "Automatic surface border");
    DisplayTheme::applyScreen(surface);
    expectFlat(surface, 0);
    expect(lv_obj_get_style_border_width(surface, LV_PART_MAIN) == 0, "applyScreen removes border");
    DisplayTheme::applySurface(surface);
    expectFlat(surface, DisplayTheme::Radius);
    expect(lv_obj_get_style_border_width(surface, LV_PART_MAIN) == 1, "applySurface adds border");
    lv_obj_center(label(surface, "White surface / dark text"));
    renderer.capture("widgets-surfaces");
    renderer.expectPixel(2, 2, DisplayTheme::background(), "Rendered white background");
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
                ? (helpers ? lv_color_darken(bg, LV_OPA_20) : DisplayTheme::primaryPressed()) : bg;
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
                expect(rendered == lv_color_to_u16(DisplayTheme::background()), "Transparent logo pixel composites on white");
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
        if (states[i] == CardScreen::STATUS_ERROR) card.setStatusMessage(Fixtures::errorMessage);
        auto *status = requireObject(screen.root, &lv_label_class, text[i]);
        expectColor(lv_obj_get_style_text_color(status, LV_PART_MAIN), colors[i], name + ": status color");
        expect(lv_obj_has_flag(cancel, LV_OBJ_FLAG_HIDDEN) == (states[i] == CardScreen::STATUS_SUCCESS), name + ": cancel visibility");
        renderer.capture(name + "-" + suffix[i]);
        expect(lv_bar_get_value(bar) == 30, name + ": fixed 30-second countdown");
    }
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
    SupervisionScreen::View view{Fixtures::nowMs + 30000, Fixtures::userName, Fixtures::errorMessage, Fixtures::supervisorHint};
    supervision.render(view);
    supervision.init();
    ScreenGuard screen(supervision.getScreen(), &supervision);
    requireObject(screen.root, &lv_label_class, Fixtures::userName);
    requireObject(screen.root, &lv_label_class, Fixtures::supervisorHint);
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
        expect(lv_obj_has_flag(cancel, LV_OBJ_FLAG_HIDDEN) == (view.status == SupervisionScreen::STATUS_SUCCESS), "Supervision cancel visibility");
        renderer.capture(std::string("supervision-") + suffix[i]);
    }
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
    ScreenGuard screen(pin.init("Geraete-PIN"));
    auto *field = requireObject(screen.root, &lv_textarea_class);
    auto *keyboard = requireObject(screen.root, &lv_keyboard_class);
    auto *title = requireObject(screen.root, &lv_label_class, "Geraete-PIN");
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
        test("theme/surfaces-and-font", [&] { testSurfaces(renderer); });
        test("theme/automatic-button-states", [&] { testButtons(renderer, false); });
        test("theme/helper-button-states", [&] { testButtons(renderer, true); });
        test("theme/fields-and-keyboard-states", [&] { testInputs(renderer); });
        test("render/production-logo-bytes", [&] { testLogos(renderer); });
        test("screen/boot", [&] { testBoot(renderer); });
        test("screen/init", [&] { testInit(renderer); });
        test("screen/enrollment", [&] { testCard<EnrollmentScreen>(renderer, "enrollment", "Karte wird beschrieben...\nbitte nicht bewegen", "Karte registriert!"); });
        test("screen/reset", [&] { testCard<ResetScreen>(renderer, "reset", "Karte wird zurueckgesetzt...\nbitte nicht bewegen", "Karte zurueckgesetzt!"); });
        test("screen/supervision", [&] { testSupervision(renderer); });
        test("screen/pin-and-real-keyboard-events", [&] { testPin(renderer); });
        std::cout << "RESULT " << passed << " passed, " << failed << " failed; " << checks << " checks; "
                  << renderer.captures << " real LVGL frames\n";
        std::cout << "COVERAGE: production theme, boot/init/enrollment/reset/supervision/PIN and both logo assets.\n"
                     "NOT COVERED: devices, RTOS, transport, full router/overlays, remaining screens or pixel-golden approval.\n";
        if (!output.empty()) std::cout << "OUTPUT " << std::filesystem::absolute(output) << '\n';
        return failed || lvglErrors ? 1 : 0;
    } catch (const std::exception &error) {
        std::cerr << "Harness error: " << error.what() << '\n';
        return 2;
    }
}
