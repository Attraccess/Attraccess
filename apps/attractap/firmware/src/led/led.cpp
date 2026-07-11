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

void LedController::setup()
{
    _globalBrightness = Settings::getLedBrightness();
    _strip.begin();
    _strip.setBrightness(_globalBrightness);
    _strip.show();
}

void LedController::setBrightness(uint8_t brightness)
{
    _globalBrightness = brightness;
    _strip.setBrightness(_globalBrightness);
}

void LedController::setState(LedState state)
{
    if (_trigger != TRIGGER_NONE)
    {
        return;
    }
    _state = state;
    _firmwarePatternSet = false;
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
        if (!_firmwarePatternSet)
        {
            uint16_t n = _strip.numPixels();
            for (uint16_t i = 0; i < n; i++)
            {
                if (i % 2 == 0)
                    _strip.setPixelColor(i, _strip.Color(0, 0, 255));
                else
                    _strip.setPixelColor(i, _strip.Color(255, 255, 255));
            }
            _strip.show();
            _firmwarePatternSet = true;
        }
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
