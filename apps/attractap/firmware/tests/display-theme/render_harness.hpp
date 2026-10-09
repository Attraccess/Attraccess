#pragma once
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
#include "display/shared/pinInput/pinInputPage.hpp"
#include "fixtures.hpp"
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

inline unsigned checks = 0;
inline unsigned lvglErrors = 0;

inline void expect(bool condition, const std::string &message)
{
    ++checks;
    if (!condition) throw std::runtime_error(message);
}

inline void expectColor(lv_color_t actual, lv_color_t expected, const std::string &message)
{
    std::ostringstream detail;
    detail << message << ": expected #" << std::hex << std::setw(6) << std::setfill('0')
           << (lv_color_to_u32(expected) & 0xFFFFFF) << ", got #" << std::setw(6) << (lv_color_to_u32(actual) & 0xFFFFFF);
    expect(lv_color_eq(actual, expected), detail.str());
}

inline void settle()
{
    // Advance LVGL animations, never wall-clock time or the independent firmware clock.
    for (unsigned i = 0; i < 20; ++i) {
        lv_tick_inc(16);
        lv_timer_handler();
    }
}

inline void setState(lv_obj_t *obj, lv_state_t state)
{
    lv_obj_remove_state(obj, LV_STATE_ANY);
    lv_obj_add_state(obj, state);
    settle();
}

inline lv_obj_t *findObject(lv_obj_t *root, const lv_obj_class_t *type, const char *text = nullptr)
{
    if (lv_obj_check_type(root, type) && (!text || std::strcmp(lv_label_get_text(root), text) == 0))
        return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *found = findObject(lv_obj_get_child(root, i), type, text)) return found;
    return nullptr;
}

inline lv_obj_t *requireObject(lv_obj_t *root, const lv_obj_class_t *type, const char *text = nullptr)
{
    auto *obj = findObject(root, type, text);
    expect(obj != nullptr, std::string("Missing production widget: ") + (text ? text : "class lookup"));
    return obj;
}

inline lv_obj_t *label(lv_obj_t *parent, const char *text)
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

inline void expectFlat(lv_obj_t *obj, int32_t radius)
{
    expect(lv_obj_get_style_bg_opa(obj, LV_PART_MAIN) == LV_OPA_COVER, "Opaque background");
    expect(lv_obj_get_style_bg_grad_dir(obj, LV_PART_MAIN) == LV_GRAD_DIR_NONE, "No gradient");
    expect(lv_obj_get_style_shadow_width(obj, LV_PART_MAIN) == 0, "No shadow");
    expect(lv_obj_get_style_radius(obj, LV_PART_MAIN) == radius, "Theme corner radius");
}


void testLatin1Fonts(Renderer &renderer);
void testSurfaces(Renderer &renderer);
void testButtons(Renderer &renderer, bool helpers);
void testInputs(Renderer &renderer);
void testLogos(Renderer &renderer);
void testBoot(Renderer &renderer);
void testInit(Renderer &renderer);
template <typename CardScreen>
void testCard(Renderer &renderer, const std::string &name, const char *writing, const char *success);
void testSupervision(Renderer &renderer);
void testPin(Renderer &renderer);
void testBackgroundScreens(Renderer &renderer);
void testAuthenticatedList(Renderer &renderer);
void testUsageStatsExpiry(Renderer &renderer);
void testIntroducerDetails(Renderer &renderer);
