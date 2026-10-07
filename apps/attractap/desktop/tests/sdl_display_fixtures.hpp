#pragma once
#include "sdl_display.hpp"
#include "display/display.hpp"

#include <cassert>
#include <cmath>
#include <cstring>
#include <filesystem>
#include <utility>
#include <vector>

inline SDL_Window *window = nullptr;
inline SDL_Renderer *renderer = nullptr;

inline void pointer(SdlDisplay &display, SDL_EventType type, float x, float y, Uint8 button = SDL_BUTTON_LEFT)
{
    float windowX, windowY;
    assert(SDL_RenderCoordinatesToWindow(renderer, x, y, &windowX, &windowY));
    SDL_Event event{};
    event.type = type;
    if (type == SDL_EVENT_MOUSE_MOTION)
    {
        event.motion.windowID = SDL_GetWindowID(window);
        event.motion.x = windowX;
        event.motion.y = windowY;
    }
    else
    {
        event.button.windowID = SDL_GetWindowID(window);
        event.button.button = button;
        event.button.x = windowX;
        event.button.y = windowY;
    }
    assert(SDL_PushEvent(&event));
    assert(display.pollEvents());
}

inline void click(SdlDisplay &display, float x, float y)
{
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, x, y);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, x, y);
}

inline bool signal(SdlDisplay &display, SDL_EventType type)
{
    SDL_Event event{};
    event.type = type;
    if (type == SDL_EVENT_KEY_DOWN)
        event.key.key = SDLK_ESCAPE;
    else
        event.window.windowID = SDL_GetWindowID(window);
    assert(SDL_PushEvent(&event));
    return display.pollEvents();
}

inline void screenshot(const std::filesystem::path &directory, const char *name)
{
    if (directory.empty()) return;
    // CTest uses SDL's software renderer, whose presented frame remains readable.
    SDL_Surface *frame = SDL_RenderReadPixels(renderer, nullptr);
    assert(frame);
    assert(SDL_SavePNG(frame, (directory / name).c_str()));
    SDL_DestroySurface(frame);
}

inline lv_obj_t *findLabel(lv_obj_t *root, const char *text)
{
    if (lv_obj_check_type(root, &lv_label_class) && std::strcmp(lv_label_get_text(root), text) == 0)
        return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *label = findLabel(lv_obj_get_child(root, i), text)) return label;
    return nullptr;
}

inline void expectUmlaut(lv_obj_t *label)
{
    assert(label);
    lv_font_glyph_dsc_t glyph{};
    assert(lv_font_get_glyph_dsc(lv_obj_get_style_text_font(label, LV_PART_MAIN), &glyph, 0xFC, 'n'));
    assert(!glyph.is_placeholder);
    assert(glyph.box_w > 0 && glyph.box_h > 0);
}

inline lv_obj_t *findWidget(lv_obj_t *root, const lv_obj_class_t *type)
{
    if (lv_obj_check_type(root, type)) return root;
    for (uint32_t i = 0; i < lv_obj_get_child_count(root); ++i)
        if (auto *widget = findWidget(lv_obj_get_child(root, i), type)) return widget;
    return nullptr;
}

inline void expectReadableOption(lv_obj_t *label)
{
    const auto luminance = [](lv_color_t color) {
        const auto linear = [](uint8_t channel) {
            const double value = channel / 255.0;
            return value <= 0.04045 ? value / 12.92 : std::pow((value + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * linear(color.red) + 0.7152 * linear(color.green) + 0.0722 * linear(color.blue);
    };
    const double foreground = luminance(lv_obj_get_style_text_color(label, LV_PART_MAIN));
    const double background = luminance(lv_obj_get_style_bg_color(lv_obj_get_parent(label), LV_PART_MAIN));
    const double ratio = foreground > background ? (foreground + 0.05) / (background + 0.05)
                                               : (background + 0.05) / (foreground + 0.05);
    assert(ratio >= 4.5);
}

void testFormDrafts();
void testPaymentPopup();
void testLockscreen(SdlDisplay &display, const std::filesystem::path &screenshots);
