#include "sdl_display.hpp"

#include <algorithm>
#include <cstring>
#include <stdexcept>

SdlDisplay::~SdlDisplay()
{
    if (texture) SDL_DestroyTexture(texture);
    if (renderer) SDL_DestroyRenderer(renderer);
    if (window) SDL_DestroyWindow(window);
    SDL_Quit();
}

bool SdlDisplay::begin()
{
    if (!SDL_Init(SDL_INIT_VIDEO))
        throw std::runtime_error(SDL_GetError());
    window = SDL_CreateWindow("Attractap Desktop", Width, Height, 0);
    renderer = SDL_CreateRenderer(window, nullptr);
    texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGB565, SDL_TEXTUREACCESS_STREAMING, Width, Height);
    if (!window || !renderer || !texture)
        throw std::runtime_error(SDL_GetError());
    return true;
}

void SdlDisplay::flush(const lv_area_t *area, uint8_t *pxMap)
{
    void *pixels = nullptr;
    int pitch = 0;
    const SDL_Rect target{area->x1, area->y1, area->x2 - area->x1 + 1, area->y2 - area->y1 + 1};
    if (!SDL_LockTexture(texture, &target, &pixels, &pitch))
        return;

    const int rowBytes = target.w * LV_COLOR_FORMAT_GET_SIZE(LV_COLOR_FORMAT_RGB565);
    for (int row = 0; row < target.h; ++row)
        std::memcpy(static_cast<uint8_t *>(pixels) + row * pitch, pxMap + row * rowBytes, rowBytes);
    SDL_UnlockTexture(texture);
    SDL_RenderTexture(renderer, texture, nullptr, nullptr);
    SDL_RenderPresent(renderer);
}

bool SdlDisplay::readTouch(TouchPoint &point)
{
    point = touch;
    return point.pressed;
}

bool SdlDisplay::pollEvents()
{
    SDL_Event event;
    while (SDL_PollEvent(&event))
    {
        if (event.type == SDL_EVENT_QUIT)
            return false;
        if (event.type == SDL_EVENT_KEY_DOWN && keyCallback)
            keyCallback(event.key.key);
        if (event.type == SDL_EVENT_MOUSE_MOTION || event.type == SDL_EVENT_MOUSE_BUTTON_DOWN || event.type == SDL_EVENT_MOUSE_BUTTON_UP)
        {
            const float x = event.type == SDL_EVENT_MOUSE_MOTION ? event.motion.x : event.button.x;
            const float y = event.type == SDL_EVENT_MOUSE_MOTION ? event.motion.y : event.button.y;
            touch.x = static_cast<int16_t>(std::clamp(x, 0.0F, static_cast<float>(Width - 1)));
            touch.y = static_cast<int16_t>(std::clamp(y, 0.0F, static_cast<float>(Height - 1)));
            if (event.type == SDL_EVENT_MOUSE_BUTTON_DOWN && event.button.button == SDL_BUTTON_LEFT)
                touch.pressed = true;
            if (event.type == SDL_EVENT_MOUSE_BUTTON_UP && event.button.button == SDL_BUTTON_LEFT)
                touch.pressed = false;
        }
    }
    return true;
}
