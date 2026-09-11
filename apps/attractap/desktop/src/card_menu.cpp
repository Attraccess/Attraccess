#include "card_menu.hpp"
#include "sdl_drawing.hpp"

#include <array>
#include <string>

namespace
{
constexpr SDL_FRect Panel{20, 578, 460, 302};
constexpr SDL_FRect CloseButton{436, 590, 28, 28};
constexpr SDL_FRect ClearButton{38, 834, 424, 28};
constexpr SDL_Color Foreground{237, 246, 246, 255};
constexpr SDL_Color Muted{157, 183, 185, 255};
constexpr SDL_Color Accent{116, 225, 206, 255};
constexpr std::array<const char *, CardMenu::CardCount> CardUids{
    "04 AA BB CC DD EE 01", "04 AA BB CC DD EE 02",
    "04 AA BB CC DD EE 03", "04 AA BB CC DD EE 04"};

SDL_FRect cardRect(size_t index)
{
    return {38 + static_cast<float>(index % 2) * 218,
            646 + static_cast<float>(index / 2) * 92, 206, 80};
}
}

void CardMenu::open()
{
    opened = true;
    clearConfirmation = false;
}

void CardMenu::close()
{
    release();
    opened = false;
    clearConfirmation = false;
}

bool CardMenu::contains(float x, float y) const
{
    return opened && SdlDrawing::containsRounded(Panel, 18, x, y);
}

bool CardMenu::isInteractive(float x, float y) const
{
    return opened && (cardAt(x, y) >= 0 || SdlDrawing::contains(CloseButton, x, y) ||
                      SdlDrawing::contains(ClearButton, x, y));
}

void CardMenu::press(float x, float y)
{
    if (!opened) return;
    if (SdlDrawing::contains(CloseButton, x, y))
    {
        close();
    }
    else if (const int card = cardAt(x, y); card >= 0)
    {
        release();
        pressedCard = card;
        selectedCard = static_cast<size_t>(card);
        clearConfirmation = false;
        if (cardPresenceCallback) cardPresenceCallback(selectedCard, true);
    }
    else if (SdlDrawing::contains(ClearButton, x, y))
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
    else
    {
        clearConfirmation = false;
    }
}

void CardMenu::release()
{
    if (pressedCard < 0) return;
    const size_t card = static_cast<size_t>(pressedCard);
    pressedCard = -1;
    if (cardPresenceCallback) cardPresenceCallback(card, false);
}

void CardMenu::render(SDL_Renderer *renderer, float pointerX, float pointerY) const
{
    if (!opened) return;
    using namespace SdlDrawing;
    roundedRect(renderer, {Panel.x - 3, Panel.y + 4, Panel.w + 6, Panel.h + 2}, 20, {0, 0, 0, 90});
    roundedRect(renderer, Panel, 18, {71, 109, 111, 255});
    roundedRect(renderer, {Panel.x + 1, Panel.y + 1, Panel.w - 2, Panel.h - 2}, 17, {15, 31, 34, 255});
    text(renderer, 38, 600, "VIRTUAL NFC CARDS", Foreground);
    text(renderer, 38, 622, "Hold to present. Release to remove.", Muted);

    roundedRect(renderer, CloseButton, 7, SdlDrawing::contains(CloseButton, pointerX, pointerY)
                                                ? SDL_Color{58, 86, 89, 255} : SDL_Color{30, 51, 54, 255});
    centeredText(renderer, CloseButton, CloseButton.y + 10, "X", Foreground);

    for (size_t index = 0; index < CardCount; ++index)
    {
        const SDL_FRect rect = cardRect(index);
        const bool pressed = pressedCard == static_cast<int>(index);
        const bool highlighted = selectedCard == index || containsRounded(rect, 10, pointerX, pointerY);
        roundedRect(renderer, rect, 10, highlighted ? Accent : SDL_Color{62, 89, 92, 255});
        roundedRect(renderer, {rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2}, 9,
                    pressed ? SDL_Color{25, 103, 88, 255} : SDL_Color{28, 48, 51, 255});
        centeredText(renderer, rect, rect.y + 14, "CARD " + std::to_string(index + 1), Foreground);
        centeredText(renderer, rect, rect.y + 35, CardUids[index], Muted);
        centeredText(renderer, rect, rect.y + 58, pressed ? "PRESENTED" : "PRESS AND HOLD", pressed ? Accent : Foreground);
    }

    roundedRect(renderer, ClearButton, 7, clearConfirmation ? SDL_Color{111, 46, 42, 255}
                : SdlDrawing::contains(ClearButton, pointerX, pointerY) ? SDL_Color{49, 73, 76, 255} : SDL_Color{30, 51, 54, 255});
    centeredText(renderer, ClearButton, ClearButton.y + 10,
                 clearConfirmation ? "CLICK AGAIN TO CLEAR CARD " + std::to_string(selectedCard + 1)
                                   : "CLEAR STORED DATA FOR CARD " + std::to_string(selectedCard + 1),
                 clearConfirmation ? SDL_Color{255, 207, 199, 255} : Muted);
}

int CardMenu::cardAt(float x, float y) const
{
    for (size_t index = 0; index < CardCount; ++index)
        if (SdlDrawing::containsRounded(cardRect(index), 10, x, y)) return static_cast<int>(index);
    return -1;
}
