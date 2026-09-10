#pragma once

#include "display/driver/display_driver.hpp"

#include <SDL3/SDL.h>
#include <functional>

class SdlDisplay final : public IDisplayDriver
{
public:
    static constexpr uint32_t Width = 480;
    static constexpr uint32_t Height = 480;

    ~SdlDisplay() override;
    bool begin() override;
    uint32_t width() const override { return Width; }
    uint32_t height() const override { return Height; }
    void flush(const lv_area_t *area, uint8_t *pxMap) override;
    bool readTouch(TouchPoint &point) override;
    bool pollEvents();
    void setKeyCallback(std::function<void(SDL_Keycode)> callback) { keyCallback = std::move(callback); }

private:
    SDL_Window *window = nullptr;
    SDL_Renderer *renderer = nullptr;
    SDL_Texture *texture = nullptr;
    TouchPoint touch{0, 0, false};
    std::function<void(SDL_Keycode)> keyCallback;
};
