#include "sdl_display.hpp"
#include "display/display.hpp"

#include <cassert>
#include <cmath>
#include <filesystem>
#include <utility>
#include <vector>

namespace
{
SDL_Window *window = nullptr;
SDL_Renderer *renderer = nullptr;

void pointer(SdlDisplay &display, SDL_EventType type, float x, float y, Uint8 button = SDL_BUTTON_LEFT)
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

void click(SdlDisplay &display, float x, float y)
{
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, x, y);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, x, y);
}

bool signal(SdlDisplay &display, SDL_EventType type)
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

void screenshot(const std::filesystem::path &directory, const char *name)
{
    if (directory.empty()) return;
    // CTest uses SDL's software renderer, whose presented frame remains readable.
    SDL_Surface *frame = SDL_RenderReadPixels(renderer, nullptr);
    assert(frame);
    assert(SDL_SavePNG(frame, (directory / name).c_str()));
    SDL_DestroySurface(frame);
}
}

int main(int argc, char **argv)
{
    const std::filesystem::path screenshots = argc > 1 ? argv[1] : "";
    std::vector<std::pair<size_t, bool>> presence;
    std::vector<size_t> cleared;
    SdlDisplay display;
    display.setCardPresenceCallback([&](size_t card, bool present) { presence.emplace_back(card, present); });
    display.setClearCardCallback([&](size_t card) { cleared.push_back(card); });
    Display::setup(display);
    Display::transitionToScreen(&Display::initScreen);
    lv_refr_now(nullptr);

    int windowCount = 0;
    SDL_Window **windows = SDL_GetWindows(&windowCount);
    assert(windowCount == 1);
    window = windows[0];
    SDL_free(windows);
    renderer = SDL_GetRenderer(window);
    assert(renderer);
    // Native window changes are asynchronous; wait before injecting coordinates.
    assert(SDL_SetWindowSize(window, 500, 901));
    assert(SDL_SyncWindow(window));
    assert(display.pollEvents());
    screenshot(screenshots, "device.png");

    TouchPoint touch{};
    // The firmware still sees a 480 x 480 screen, offset inside the CAD face.
    assert(display.width() == 480 && display.height() == 480);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 250, 310);
    assert(display.readTouch(touch));
    assert(std::abs(touch.x - 240) <= 1 && std::abs(touch.y - 240) <= 1);
    pointer(display, SDL_EVENT_MOUSE_MOTION, 489, 310);
    assert(display.readTouch(touch) && std::abs(touch.x - 479) <= 1);
    pointer(display, SDL_EVENT_MOUSE_MOTION, 495, 310);
    assert(!display.readTouch(touch));
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 495, 310);

    for (const SDL_FPoint point : {SDL_FPoint{250, 40}, {5, 310}, {250, 560}, {11, 71}})
    {
        pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, point.x, point.y);
        assert(!display.readTouch(touch));
        pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, point.x, point.y);
    }
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 250, 310, SDL_BUTTON_RIGHT);
    assert(!display.readTouch(touch));
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 310, SDL_BUTTON_RIGHT);

    // Hidden cards cannot be presented. Only the physical NFC target opens the menu.
    click(display, 80, 680);
    assert(presence.empty());
    click(display, 250, 730);
    assert(presence.empty());
    assert(!display.readTouch(touch));
    screenshot(screenshots, "card-menu.png");

    for (size_t card = 0; card < SdlDisplay::CardCount; ++card)
    {
        const float x = card % 2 == 0 ? 140 : 360;
        const float y = card < 2 ? 686 : 778;
        pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, x, y);
        assert(presence.size() == card * 2 + 1);
        assert(presence.back() == std::make_pair(card, true));
        assert(!display.readTouch(touch));
        // Moving off a card while still holding does not end presentation or switch cards.
        pointer(display, SDL_EVENT_MOUSE_MOTION, 250, 570);
        SDL_Delay(30);
        assert(display.pollEvents());
        assert(presence.size() == card * 2 + 1);
        if (card == 0) screenshot(screenshots, "card-presented.png");
        pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 570, SDL_BUTTON_RIGHT);
        assert(presence.size() == card * 2 + 1);
        pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 570);
        assert(presence.back() == std::make_pair(card, false));
        assert(presence.size() == (card + 1) * 2);
    }

    // Clearing still requires two clicks and targets the last selected card.
    click(display, 250, 848);
    assert(cleared.empty());
    click(display, 250, 848);
    assert(cleared == std::vector<size_t>{3});
    click(display, 250, 848);
    click(display, 450, 604); // Close, then reopen: discard an armed confirmation.
    click(display, 250, 730);
    click(display, 250, 848);
    assert(cleared.size() == 1);
    click(display, 140, 686); // Selecting another card also discards confirmation.
    click(display, 250, 848);
    assert(cleared.size() == 1);
    click(display, 250, 848);
    assert(cleared == (std::vector<size_t>{3, 0}));

    // Cancel paths cannot leave a card present, even without a mouse-up event.
    for (const SDL_EventType type : {SDL_EVENT_WINDOW_MOUSE_LEAVE, SDL_EVENT_WINDOW_FOCUS_LOST,
                                    SDL_EVENT_WINDOW_HIDDEN, SDL_EVENT_KEY_DOWN})
    {
        pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 140, 686);
        assert(presence.back() == std::make_pair(size_t{0}, true));
        const size_t before = presence.size();
        assert(signal(display, type));
        assert(presence.size() == before + 1);
        assert(presence.back() == std::make_pair(size_t{0}, false));
        pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 140, 686);
        assert(presence.size() == before + 1);
        if (type == SDL_EVENT_WINDOW_MOUSE_LEAVE)
            click(display, 450, 604);
        click(display, 250, 730);
    }

    // Clicking the screen dismisses the menu and still reaches the firmware.
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 250, 310);
    assert(display.readTouch(touch));
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 310);
    const size_t beforeHiddenClick = presence.size();
    click(display, 140, 686);
    assert(presence.size() == beforeHiddenClick);

    // Non-proportional resizing introduces letterboxing; both hit areas track it.
    assert(SDL_SetWindowSize(window, 700, 650));
    assert(SDL_SyncWindow(window));
    assert(display.pollEvents());
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 250, 310);
    assert(display.readTouch(touch));
    assert(std::abs(touch.x - 240) <= 1 && std::abs(touch.y - 240) <= 1);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, 250, 310);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, -50, 310);
    assert(!display.readTouch(touch));
    pointer(display, SDL_EVENT_MOUSE_BUTTON_UP, -50, 310);
    screenshot(screenshots, "device-resized.png");
    click(display, 250, 730);
    pointer(display, SDL_EVENT_MOUSE_BUTTON_DOWN, 360, 778);
    assert(presence.back() == std::make_pair(size_t{3}, true));
    assert(!signal(display, SDL_EVENT_QUIT));
    assert(presence.back() == std::make_pair(size_t{3}, false));
}
