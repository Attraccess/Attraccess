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


uint16_t LedController::wrapIndex(int16_t i) const
{
    uint16_t n = _strip.numPixels();
    return ((i % (int16_t)n) + n) % n;
}

void LedController::runCircularAnimation()
{
    const uint16_t n = _strip.numPixels();

    switch (_state)
    {
    case LED_STATE_CONFIG_REQUIRED:
    {
        uint8_t subPhase = (_phase / 12) % 2;
        uint16_t third = n / 3;
        uint16_t sixth = n / 6;
        setAll(0);
        if (subPhase == 0)
        {
            uint32_t c = _strip.Color(255, 0, 0);
            for (uint8_t i = 0; i < 3; i++)
                _strip.setPixelColor(i * third, c);
        }
        else
        {
            uint32_t c = _strip.Color(255, 165, 0);
            for (uint8_t i = 0; i < 3; i++)
                _strip.setPixelColor(sixth + i * third, c);
        }
        break;
    }

    case LED_STATE_INIT:
    {
        uint16_t head = _phase % n;
        uint32_t c = _strip.Color(0, 0, 255);
        setAll(0);
        const uint8_t tailLen = 8;
        const uint8_t tailBrightness[] = {255, 180, 100, 50, 25, 10, 4, 1};
        for (uint8_t i = 0; i < tailLen; i++)
        {
            uint16_t idx = wrapIndex(head - i);
            _strip.setPixelColor(idx, dim(c, tailBrightness[i]));
        }
        break;
    }

    case LED_STATE_WAIT_FOR_CARD:
    {
        uint16_t p = _phase % IDLE_BREATH_CYCLE;
        uint8_t b = (p < IDLE_BREATH_HALF)
            ? (IDLE_BRIGHTNESS_MIN + (uint8_t)(IDLE_BRIGHTNESS_RANGE * p / IDLE_BREATH_HALF))
            : (IDLE_BRIGHTNESS_MAX - (uint8_t)(IDLE_BRIGHTNESS_RANGE * (p - IDLE_BREATH_HALF) / IDLE_BREATH_HALF));
        uint8_t bInv = IDLE_BRIGHTNESS_MIN + IDLE_BRIGHTNESS_MAX - b;
        uint32_t c = _strip.Color(0, 255, 0);
        uint16_t pieceSize = n / IDLE_SEGMENT_COUNT;
        for (uint16_t i = 0; i < n; i++)
        {
            uint8_t piece = (pieceSize > 0) ? (i / pieceSize) : 0;
            if (piece >= IDLE_SEGMENT_COUNT) piece = IDLE_SEGMENT_COUNT - 1;
            _strip.setPixelColor(i, dim(c, (piece % 2 == 0) ? b : bInv));
        }
        break;
    }

    case LED_STATE_AUTHENTICATE_CARD:
    {
        uint16_t head = (_phase * 2) % n;
        uint32_t c = _strip.Color(100, 200, 255);
        setAll(0);
        const uint8_t tailLen = 6;
        const uint8_t tailBrightness[] = {255, 180, 100, 50, 20, 8};
        for (uint8_t i = 0; i < tailLen; i++)
        {
            uint16_t idx = wrapIndex(head - i);
            _strip.setPixelColor(idx, dim(c, tailBrightness[i]));
        }
        break;
    }

    case LED_STATE_NO_RESOURCES:
    {
        uint8_t flashPhase = (_phase / 10) % 2;
        if (flashPhase == 0)
            setAll(_strip.Color(255, 165, 0));
        else
            setAll(0);
        break;
    }

    case LED_STATE_FIRMWARE_UPDATE:
        break;
    }
}

void LedController::runLinearAnimation()
{
    switch (_state)
    {
    case LED_STATE_CONFIG_REQUIRED:
    {
        uint16_t p = _phase % 40;
        uint8_t b = (p < 20) ? (64 + (uint8_t)(64 * p / 20)) : (128 - (uint8_t)(64 * (p - 20) / 20));
        uint32_t c = _strip.Color(255, 165, 0);
        setAll(dim(c, b));
        break;
    }

    case LED_STATE_INIT:
    {
        uint16_t p = _phase % 30;
        uint8_t b = (p < 15) ? (32 + (uint8_t)(96 * p / 15)) : (128 - (uint8_t)(96 * (p - 15) / 15));
        uint32_t c = _strip.Color(0, 0, 255);
        setAll(dim(c, b));
        break;
    }

    case LED_STATE_WAIT_FOR_CARD:
    {
        uint16_t p = _phase % 25;
        uint8_t b = (p < 13) ? (48 + (uint8_t)(48 * p / 13)) : (96 - (uint8_t)(48 * (p - 13) / 12));
        uint32_t c = _strip.Color(0, 255, 0);
        setAll(dim(c, b));
        break;
    }

    case LED_STATE_AUTHENTICATE_CARD:
    {
        uint16_t p = _phase % 10;
        uint8_t b = (p < 5) ? (80 + (uint8_t)(80 * p / 5)) : (160 - (uint8_t)(80 * (p - 5) / 5));
        uint32_t c = _strip.Color(100, 200, 255);
        setAll(dim(c, b));
        break;
    }

    case LED_STATE_NO_RESOURCES:
    {
        if ((_phase / 10) % 2 == 0)
        {
            setAll(_strip.Color(255, 165, 0));
        }
        else
        {
            setAll(0);
        }
        break;
    }

    case LED_STATE_FIRMWARE_UPDATE:
        break;
    }
}

#endif
