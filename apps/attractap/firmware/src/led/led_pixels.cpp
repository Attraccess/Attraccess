#ifdef HAS_WS2812_LED

#include "led.hpp"
#include "../platform.hpp"
#include "../settings/settings.hpp"

#ifndef PIN_WS2812_DATA
#define PIN_WS2812_DATA 38
#endif
#ifndef WS2812_LED_COUNT
#define WS2812_LED_COUNT 8
#endif


void LedController::setAll(uint32_t color)
{
    for (uint16_t i = 0; i < _strip.numPixels(); i++)
    {
        _strip.setPixelColor(i, color);
    }
}

uint32_t LedController::wheel(uint8_t pos)
{
    pos = 255 - pos;
    if (pos < 85)
    {
        return _strip.Color(255 - pos * 3, 0, pos * 3);
    }
    if (pos < 170)
    {
        pos -= 85;
        return _strip.Color(0, pos * 3, 255 - pos * 3);
    }
    pos -= 170;
    return _strip.Color(pos * 3, 255 - pos * 3, 0);
}

uint32_t LedController::dim(uint32_t color, uint8_t factor)
{
    uint8_t r = (uint8_t)(color >> 16);
    uint8_t g = (uint8_t)(color >> 8);
    uint8_t b = (uint8_t)(color);
    r = (uint8_t)((uint16_t)r * factor / 255);
    g = (uint8_t)((uint16_t)g * factor / 255);
    b = (uint8_t)((uint16_t)b * factor / 255);
    return _strip.Color(r, g, b);
}

#endif
