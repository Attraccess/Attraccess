#pragma once

#include "display/driver/display_driver.hpp"
#include "card_menu.hpp"

#include <SDL3/SDL.h>
#include <functional>

class SdlDisplay final : public IDisplayDriver
{
public:
    static constexpr uint32_t Width = 480;
    static constexpr uint32_t Height = 480;
    static constexpr uint32_t WindowWidth = 500;
    static constexpr uint32_t WindowHeight = 901;
    static constexpr size_t CardCount = CardMenu::CardCount;

    ~SdlDisplay() override;
    bool begin() override;
    uint32_t width() const override { return Width; }
    uint32_t height() const override { return Height; }
    void flush(const lv_area_t *area, uint8_t *pxMap) override;
    bool readTouch(TouchPoint &point) override;
    bool pollEvents();
    void setCardPresenceCallback(std::function<void(size_t, bool)> callback) { cardMenu.setCardPresenceCallback(std::move(callback)); }
    void setClearCardCallback(std::function<void(size_t)> callback) { cardMenu.setClearCardCallback(std::move(callback)); }

private:
    void render();
    void updateCursor();
    void cancelInput();

    SDL_Window *window = nullptr;
    SDL_Renderer *renderer = nullptr;
    SDL_Texture *texture = nullptr;
    SDL_Texture *deviceTexture = nullptr;
    SDL_Cursor *pointerCursor = nullptr;
    TouchPoint touch{0, 0, false};
    float pointerX = -1;
    float pointerY = -1;
    CardMenu cardMenu;
};
