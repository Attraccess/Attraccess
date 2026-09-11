#pragma once

#include "display/driver/display_driver.hpp"

#include <SDL3/SDL.h>
#include <array>
#include <functional>
#include <string>

class SdlDisplay final : public IDisplayDriver
{
public:
    static constexpr uint32_t Width = 480;
    static constexpr uint32_t Height = 480;
    static constexpr uint32_t WindowHeight = Height * 2;
    static constexpr size_t CardCount = 4;

    ~SdlDisplay() override;
    bool begin() override;
    uint32_t width() const override { return Width; }
    uint32_t height() const override { return Height; }
    void flush(const lv_area_t *area, uint8_t *pxMap) override;
    bool readTouch(TouchPoint &point) override;
    bool pollEvents();
    void setCardPresenceCallback(std::function<void(size_t, bool)> callback) { cardPresenceCallback = std::move(callback); }
    void setClearCardCallback(std::function<void(size_t)> callback) { clearCardCallback = std::move(callback); }

private:
    static constexpr std::array<const char *, CardCount> CardUids{
        "04 AA BB CC DD EE 01", "04 AA BB CC DD EE 02",
        "04 AA BB CC DD EE 03", "04 AA BB CC DD EE 04"};

    void render();
    void releaseCard();
    int cardAt(float x, float y) const;
    bool clearButtonContains(float x, float y) const;

    SDL_Window *window = nullptr;
    SDL_Renderer *renderer = nullptr;
    SDL_Texture *texture = nullptr;
    TouchPoint touch{0, 0, false};
    int pressedCard = -1;
    size_t selectedCard = 0;
    bool clearConfirmation = false;
    std::function<void(size_t, bool)> cardPresenceCallback;
    std::function<void(size_t)> clearCardCallback;
};
