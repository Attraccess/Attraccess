#include "sdl_display.hpp"
#include "sdl_drawing.hpp"

#include <algorithm>
#include <cstring>
#include <stdexcept>
#include <vector>

extern const uint8_t deviceImageStart[] asm("_binary_attractap_device_start");
extern const uint8_t deviceImageEnd[] asm("_binary_attractap_device_end");

namespace
{
// Measured from assets/attractap.png, scaled to the 500 x 901 logical canvas.
constexpr SDL_FRect Screen{10, 70, 480, 480};
constexpr float ScreenRadius = 12;
constexpr SDL_FRect NfcArea{126, 613, 248, 235};
constexpr float NfcRadius = 20;
constexpr SDL_FRect Device{0, 0, SdlDisplay::WindowWidth, SdlDisplay::WindowHeight};
}

SdlDisplay::~SdlDisplay()
{
    cardMenu.close();
    if (pointerCursor)
    {
        SDL_SetCursor(SDL_GetDefaultCursor());
        SDL_DestroyCursor(pointerCursor);
    }
    if (deviceTexture) SDL_DestroyTexture(deviceTexture);
    if (texture) SDL_DestroyTexture(texture);
    if (renderer) SDL_DestroyRenderer(renderer);
    if (window) SDL_DestroyWindow(window);
    SDL_Quit();
}

bool SdlDisplay::begin()
{
    if (!SDL_Init(SDL_INIT_VIDEO))
        throw std::runtime_error(SDL_GetError());

    // Fit laptop screens on first launch; resizing uses the same logical coordinates.
    SDL_Rect available;
    float scale = 1;
    if (SDL_GetDisplayUsableBounds(SDL_GetPrimaryDisplay(), &available))
        scale = std::min({1.0F, (available.w - 64.0F) / WindowWidth, (available.h - 64.0F) / WindowHeight});
    window = SDL_CreateWindow("Attractap Desktop", static_cast<int>(WindowWidth * scale),
                              static_cast<int>(WindowHeight * scale), SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY);
    if (!window) throw std::runtime_error(SDL_GetError());
    renderer = SDL_CreateRenderer(window, nullptr);
    if (!renderer) throw std::runtime_error(SDL_GetError());
    SDL_SetRenderLogicalPresentation(renderer, WindowWidth, WindowHeight, SDL_LOGICAL_PRESENTATION_LETTERBOX);
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);

    SDL_Surface *device = SDL_LoadPNG_IO(SDL_IOFromConstMem(deviceImageStart, deviceImageEnd - deviceImageStart), true);
    if (!device) throw std::runtime_error(SDL_GetError());
    SDL_SetWindowIcon(window, device);
    deviceTexture = SDL_CreateTextureFromSurface(renderer, device);
    SDL_DestroySurface(device);
    if (!deviceTexture) throw std::runtime_error(SDL_GetError());
    SDL_SetTextureScaleMode(deviceTexture, SDL_SCALEMODE_LINEAR);

    texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGB565, SDL_TEXTUREACCESS_STREAMING, Width, Height);
    if (!texture) throw std::runtime_error(SDL_GetError());
    SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_LINEAR);
    const std::vector<uint16_t> black(Width * Height, 0);
    SDL_UpdateTexture(texture, nullptr, black.data(), Width * sizeof(black.front()));
    pointerCursor = SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_POINTER);
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
    bool redraw = false;
    while (SDL_PollEvent(&event))
    {
        if (event.type == SDL_EVENT_QUIT || event.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED)
        {
            cancelInput();
            return false;
        }
        if (event.type == SDL_EVENT_MOUSE_MOTION || event.type == SDL_EVENT_MOUSE_BUTTON_DOWN || event.type == SDL_EVENT_MOUSE_BUTTON_UP)
        {
            SDL_ConvertEventToRenderCoordinates(renderer, &event);
            pointerX = event.type == SDL_EVENT_MOUSE_MOTION ? event.motion.x : event.button.x;
            pointerY = event.type == SDL_EVENT_MOUSE_MOTION ? event.motion.y : event.button.y;
            const bool onScreen = SdlDrawing::containsRounded(Screen, ScreenRadius, pointerX, pointerY);
            const bool onNfc = SdlDrawing::containsRounded(NfcArea, NfcRadius, pointerX, pointerY);
            if (event.type == SDL_EVENT_MOUSE_BUTTON_UP && event.button.button == SDL_BUTTON_LEFT)
            {
                touch.pressed = false;
                cardMenu.release();
            }
            else if (event.type == SDL_EVENT_MOUSE_BUTTON_DOWN && event.button.button == SDL_BUTTON_LEFT)
            {
                touch.pressed = false;
                if (cardMenu.contains(pointerX, pointerY))
                    cardMenu.press(pointerX, pointerY);
                else if (cardMenu.isOpen())
                {
                    cardMenu.close();
                    touch.pressed = onScreen;
                }
                else if (onNfc)
                    cardMenu.open();
                else
                    touch.pressed = onScreen;
            }
            if (touch.pressed)
            {
                touch.pressed = onScreen;
                touch.x = static_cast<int16_t>(std::clamp((pointerX - Screen.x) * Width / Screen.w, 0.0F, static_cast<float>(Width - 1)));
                touch.y = static_cast<int16_t>(std::clamp((pointerY - Screen.y) * Height / Screen.h, 0.0F, static_cast<float>(Height - 1)));
            }
            redraw = true;
        }
        if (event.type == SDL_EVENT_KEY_DOWN && event.key.key == SDLK_ESCAPE)
        {
            cancelInput();
            redraw = true;
        }
        if (event.type == SDL_EVENT_WINDOW_MOUSE_LEAVE || event.type == SDL_EVENT_WINDOW_FOCUS_LOST ||
            event.type == SDL_EVENT_WINDOW_HIDDEN)
        {
            touch.pressed = false;
            cardMenu.release();
            if (event.type != SDL_EVENT_WINDOW_MOUSE_LEAVE) cardMenu.close();
            pointerX = pointerY = -1;
            redraw = true;
        }
        if (event.type == SDL_EVENT_WINDOW_EXPOSED || event.type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED)
            redraw = true;
    }
    if (redraw)
    {
        updateCursor();
        render();
    }
    return true;
}

void SdlDisplay::render()
{
    SDL_SetRenderDrawColor(renderer, 13, 22, 24, 255);
    SDL_RenderClear(renderer);
    SDL_RenderTexture(renderer, deviceTexture, nullptr, &Device);
    SdlDrawing::roundedRect(renderer, Screen, ScreenRadius, {255, 255, 255, 255}, texture);

    if (!cardMenu.isOpen())
    {
        if (SdlDrawing::containsRounded(NfcArea, NfcRadius, pointerX, pointerY))
            SdlDrawing::roundedRect(renderer, NfcArea, NfcRadius, {116, 225, 206, 35});
        SdlDrawing::centeredText(renderer, Device, 872, "CLICK NFC TO PRESENT A CARD", {218, 247, 242, 255});
    }
    cardMenu.render(renderer, pointerX, pointerY);
    SDL_RenderPresent(renderer);
}

void SdlDisplay::updateCursor()
{
    const bool interactive = cardMenu.isOpen() ? cardMenu.isInteractive(pointerX, pointerY)
                            : SdlDrawing::containsRounded(NfcArea, NfcRadius, pointerX, pointerY);
    SDL_SetCursor(interactive && pointerCursor ? pointerCursor : SDL_GetDefaultCursor());
}

void SdlDisplay::cancelInput()
{
    touch.pressed = false;
    cardMenu.close();
}
