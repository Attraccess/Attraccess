#ifdef HAS_WS2812_LED

#include "led.hpp"

#ifndef PIN_WS2812_DATA
#define PIN_WS2812_DATA 38
#endif
#ifndef WS2812_LED_COUNT
#define WS2812_LED_COUNT 8
#endif

void LedController::setup()
{
    _strip.begin();
    _strip.show();
}

void LedController::setState(LedState state)
{
    if (_trigger != TRIGGER_NONE)
    {
        return;
    }
    _state = state;
}

void LedController::triggerSuccess()
{
    _stateBeforeTrigger = _state;
    _trigger = TRIGGER_SUCCESS;
    _triggerStartMs = millis();
}

void LedController::triggerError()
{
    _stateBeforeTrigger = _state;
    _trigger = TRIGGER_ERROR;
    _triggerStartMs = millis();
}

void LedController::triggerIndicate()
{
    _stateBeforeTrigger = _state;
    _trigger = TRIGGER_INDICATE;
    _triggerStartMs = millis();
}

void LedController::loop()
{
    uint32_t now = millis();
    if (now - _lastUpdateMs < ANIM_INTERVAL_MS)
    {
        return;
    }
    _lastUpdateMs = now;

    if (_trigger != TRIGGER_NONE)
    {
        uint32_t elapsed = now - _triggerStartMs;

        switch (_trigger)
        {
        case TRIGGER_SUCCESS:
            if (elapsed < TRIGGER_DURATION_MS)
            {
                setAll(_strip.Color(0, 255, 0));
            }
            else
            {
                _trigger = TRIGGER_NONE;
                _state = _stateBeforeTrigger;
            }
            break;

        case TRIGGER_ERROR:
        {
            uint32_t flashPhase = elapsed / TRIGGER_ERROR_FLASH_MS;
            if (flashPhase >= 6)
            {
                _trigger = TRIGGER_NONE;
                _state = _stateBeforeTrigger;
            }
            else if (flashPhase % 2 == 0)
            {
                setAll(_strip.Color(255, 0, 0));
            }
            else
            {
                setAll(0);
            }
            break;
        }

        case TRIGGER_INDICATE:
            if (elapsed < TRIGGER_DURATION_MS)
            {
                uint32_t subPhase = (elapsed / 100) % 4;
                if (subPhase == 0 || subPhase == 2)
                {
                    setAll(_strip.Color(255, 255, 0));
                }
                else
                {
                    setAll(0);
                }
            }
            else
            {
                _trigger = TRIGGER_NONE;
                _state = _stateBeforeTrigger;
            }
            break;

        default:
            break;
        }

        _strip.show();
        return;
    }

    if (_state == LED_STATE_FIRMWARE_UPDATE)
    {
        return;
    }

    runAnimation();
    _strip.show();
}

void LedController::runAnimation()
{
    _phase++;
    if (isCircularRing())
    {
        runCircularAnimation();
    }
    else
    {
        runLinearAnimation();
    }
}

bool LedController::isCircularRing() const
{
#ifdef USE_CIRCULAR_LED_RING
    return true;
#else
    return false;
#endif
}

uint16_t LedController::wrapIndex(int16_t i) const
{
    uint16_t n = _strip.numPixels();
    return ((i % (int16_t)n) + n) % n;
}

void LedController::runCircularAnimation()
{
    const uint16_t n = 24;

    switch (_state)
    {
    case LED_STATE_CONFIG_REQUIRED:
    {
        uint16_t pos = _phase % n;
        uint32_t c = _strip.Color(255, 165, 0);
        setAll(0);
        _strip.setPixelColor(pos, c);
        break;
    }

    case LED_STATE_INIT:
    {
        uint16_t start = _phase % n;
        uint32_t c = _strip.Color(0, 0, 255);
        setAll(0);
        for (uint8_t i = 0; i < 6; i++)
        {
            uint16_t idx = wrapIndex(start + i);
            uint8_t falloff = 255 - (i * 42);
            _strip.setPixelColor(idx, dim(c, falloff));
        }
        break;
    }

    case LED_STATE_WAIT_FOR_CARD:
    {
        uint16_t arcLen = 4 + ((_phase / 4) % 5);
        uint16_t start = (_phase / 2) % n;
        uint32_t c = _strip.Color(0, 255, 0);
        setAll(0);
        for (uint8_t i = 0; i < arcLen; i++)
        {
            uint16_t idx = wrapIndex(start + i);
            uint8_t falloff = (i == 0 || i == arcLen - 1) ? 128 : 255;
            _strip.setPixelColor(idx, dim(c, falloff));
        }
        break;
    }

    case LED_STATE_AUTHENTICATE_CARD:
    {
        uint16_t pos = (_phase * 2) % n;
        uint32_t c = _strip.Color(100, 200, 255);
        setAll(0);
        _strip.setPixelColor(pos, c);
        break;
    }

    case LED_STATE_NO_RESOURCES:
    {
        uint8_t flashPhase = (_phase / 10) % 2;
        setAll(0);
        if (flashPhase == 0)
        {
            uint32_t c = _strip.Color(255, 165, 0);
            for (uint8_t i = 0; i < 12; i++)
            {
                _strip.setPixelColor(i, c);
                _strip.setPixelColor(wrapIndex(i + 12), c);
            }
        }
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
