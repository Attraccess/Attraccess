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
#endif
