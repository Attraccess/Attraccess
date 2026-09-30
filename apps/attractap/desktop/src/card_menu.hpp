#pragma once

#include <SDL3/SDL.h>
#include <functional>
#include <utility>

class CardMenu
{
public:
    static constexpr size_t CardCount = 4;

    void open();
    void close();
    bool isOpen() const { return opened; }
    bool contains(float x, float y) const;
    bool isInteractive(float x, float y) const;
    void press(float x, float y);
    void release();
    void render(SDL_Renderer *renderer, float pointerX, float pointerY) const;
    void setCardPresenceCallback(std::function<void(size_t, bool)> callback) { cardPresenceCallback = std::move(callback); }
    void setClearCardCallback(std::function<void(size_t)> callback) { clearCardCallback = std::move(callback); }

private:
    int cardAt(float x, float y) const;

    bool opened = false;
    int pressedCard = -1;
    size_t selectedCard = 0;
    bool clearConfirmation = false;
    std::function<void(size_t, bool)> cardPresenceCallback;
    std::function<void(size_t)> clearCardCallback;
};
