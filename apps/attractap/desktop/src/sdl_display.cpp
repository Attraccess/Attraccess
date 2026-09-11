#include "sdl_display.hpp"

#include <algorithm>
#include <cstring>
#include <string>
#include <stdexcept>

namespace
{
constexpr float PanelTop = static_cast<float>(SdlDisplay::Height);
constexpr float CardWidth = 210.0F;
constexpr float CardHeight = 135.0F;
constexpr float CardGap = 16.0F;
constexpr float CardLeft = 22.0F;
constexpr float CardTop = PanelTop + 62.0F;
constexpr SDL_FRect ClearButton{22.0F, 908.0F, 436.0F, 34.0F};

SDL_FRect cardRect(size_t index)
{
    return {CardLeft + static_cast<float>(index % 2) * (CardWidth + CardGap),
            CardTop + static_cast<float>(index / 2) * (CardHeight + CardGap),
            CardWidth, CardHeight};
}

bool contains(const SDL_FRect &rect, float x, float y)
{
    return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

void centeredText(SDL_Renderer *renderer, const SDL_FRect &rect, float y, const std::string &text)
{
    SDL_RenderDebugText(renderer, rect.x + (rect.w - static_cast<float>(text.size() * SDL_DEBUG_TEXT_FONT_CHARACTER_SIZE)) / 2.0F, y, text.c_str());
}
}

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
    window = SDL_CreateWindow("Attractap Desktop", Width, WindowHeight, 0);
    renderer = SDL_CreateRenderer(window, nullptr);
    texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGB565, SDL_TEXTUREACCESS_STREAMING, Width, Height);
    if (!window || !renderer || !texture)
        throw std::runtime_error(SDL_GetError());
    render();
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
    render();
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
        if (event.type == SDL_EVENT_MOUSE_MOTION || event.type == SDL_EVENT_MOUSE_BUTTON_DOWN || event.type == SDL_EVENT_MOUSE_BUTTON_UP)
        {
            const float x = event.type == SDL_EVENT_MOUSE_MOTION ? event.motion.x : event.button.x;
            const float y = event.type == SDL_EVENT_MOUSE_MOTION ? event.motion.y : event.button.y;
            if (event.type == SDL_EVENT_MOUSE_BUTTON_UP && event.button.button == SDL_BUTTON_LEFT)
                touch.pressed = false;
            if (y < Height)
            {
                touch.x = static_cast<int16_t>(std::clamp(x, 0.0F, static_cast<float>(Width - 1)));
                touch.y = static_cast<int16_t>(std::clamp(y, 0.0F, static_cast<float>(Height - 1)));
                if (event.type == SDL_EVENT_MOUSE_BUTTON_DOWN && event.button.button == SDL_BUTTON_LEFT)
                    touch.pressed = true;
            }
            else if (event.type == SDL_EVENT_MOUSE_BUTTON_DOWN && event.button.button == SDL_BUTTON_LEFT)
            {
                if (const int card = cardAt(x, y); card >= 0)
                {
                    releaseCard();
                    pressedCard = card;
                    selectedCard = static_cast<size_t>(card);
                    clearConfirmation = false;
                    if (cardPresenceCallback) cardPresenceCallback(selectedCard, true);
                }
                else if (clearButtonContains(x, y))
                {
                    if (clearConfirmation)
                    {
                        if (clearCardCallback) clearCardCallback(selectedCard);
                        clearConfirmation = false;
                    }
                    else
                    {
                        clearConfirmation = true;
                    }
                }
                render();
            }
            if (event.type == SDL_EVENT_MOUSE_BUTTON_UP && event.button.button == SDL_BUTTON_LEFT)
            {
                releaseCard();
                render();
            }
        }
        if (event.type == SDL_EVENT_WINDOW_MOUSE_LEAVE || event.type == SDL_EVENT_WINDOW_FOCUS_LOST)
        {
            touch.pressed = false;
            releaseCard();
            render();
        }
    }
    return true;
}

void SdlDisplay::render()
{
    SDL_SetRenderDrawColor(renderer, 13, 17, 23, 255);
    SDL_RenderClear(renderer);
    const SDL_FRect displayTarget{0, 0, static_cast<float>(Width), static_cast<float>(Height)};
    SDL_RenderTexture(renderer, texture, nullptr, &displayTarget);

    SDL_SetRenderDrawColor(renderer, 232, 237, 243, 255);
    SDL_RenderDebugText(renderer, 22, PanelTop + 20, "VIRTUAL NFC CARDS");
    SDL_SetRenderDrawColor(renderer, 135, 148, 166, 255);
    SDL_RenderDebugText(renderer, 22, PanelTop + 38, "HOLD A CARD TO PRESENT IT");

    for (size_t index = 0; index < CardCount; ++index)
    {
        const SDL_FRect rect = cardRect(index);
        const bool pressed = pressedCard == static_cast<int>(index);
        const bool selected = selectedCard == index;
        SDL_SetRenderDrawColor(renderer, pressed ? 28 : 30, pressed ? 112 : 39, pressed ? 78 : 52, 255);
        SDL_RenderFillRect(renderer, &rect);
        SDL_SetRenderDrawColor(renderer, selected ? 76 : 67, selected ? 201 : 82, selected ? 146 : 101, 255);
        SDL_RenderRect(renderer, &rect);
        centeredText(renderer, rect, rect.y + 30, "CARD " + std::to_string(index + 1));
        SDL_SetRenderDrawColor(renderer, 174, 185, 201, 255);
        centeredText(renderer, rect, rect.y + 61, CardUids[index]);
        SDL_SetRenderDrawColor(renderer, pressed ? 167 : 116, pressed ? 243 : 130, pressed ? 208 : 148, 255);
        centeredText(renderer, rect, rect.y + 96, pressed ? "PRESENTED" : "PRESS AND HOLD");
    }

    SDL_SetRenderDrawColor(renderer, clearConfirmation ? 130 : 48, clearConfirmation ? 48 : 56, clearConfirmation ? 48 : 68, 255);
    SDL_RenderFillRect(renderer, &ClearButton);
    SDL_SetRenderDrawColor(renderer, clearConfirmation ? 255 : 174, clearConfirmation ? 174 : 185, clearConfirmation ? 174 : 201, 255);
    centeredText(renderer, ClearButton, ClearButton.y + 13,
                 clearConfirmation ? "CLICK AGAIN TO CLEAR CARD " + std::to_string(selectedCard + 1)
                                   : "CLEAR STORED DATA FOR CARD " + std::to_string(selectedCard + 1));
    SDL_RenderPresent(renderer);
}

void SdlDisplay::releaseCard()
{
    if (pressedCard < 0) return;
    if (cardPresenceCallback) cardPresenceCallback(static_cast<size_t>(pressedCard), false);
    pressedCard = -1;
}

int SdlDisplay::cardAt(float x, float y) const
{
    for (size_t index = 0; index < CardCount; ++index)
        if (contains(cardRect(index), x, y)) return static_cast<int>(index);
    return -1;
}

bool SdlDisplay::clearButtonContains(float x, float y) const
{
    return contains(ClearButton, x, y);
}
