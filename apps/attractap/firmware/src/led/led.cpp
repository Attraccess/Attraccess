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

void LedController::setEnrollmentPattern(bool showPattern, const uint8_t *pattern)
{
    portENTER_CRITICAL(&_enrollmentPatternLock);
    _showEnrollmentPattern = showPattern && pattern != nullptr;
    if (_showEnrollmentPattern)
    {
        for (size_t i = 0; i < LedPattern::SEGMENT_COUNT; i++)
        {
            _enrollmentPattern[i] = pattern[i];
        }
    }
    portEXIT_CRITICAL(&_enrollmentPatternLock);
}

void LedController::setState(LedState state)
{
    if (_trigger != TRIGGER_NONE)
    {
        return;
    }
    if (_state == LED_STATE_CONFIRM_WAIT && state == LED_STATE_WAIT_FOR_CARD)
    {
        return; // the confirm window ends it (endConfirmWait or expiry)
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

void LedController::triggerReserved(bool thenBlocked)
{
    _blockedAfterReserved = thenBlocked;
    _stateBeforeTrigger = _state;
    _trigger = TRIGGER_RESERVED;
    _triggerStartMs = millis();
}

void LedController::triggerWarning()
{
    _stateBeforeTrigger = _state;
    _trigger = TRIGGER_WARNING;
    _triggerStartMs = millis();
}

void LedController::beginConfirmWait(uint32_t windowMs)
{
    _confirmWaitStartMs = millis();
    _confirmWaitWindowMs = windowMs;
    _state = LED_STATE_CONFIRM_WAIT;
    _firmwarePatternSet = false;
}

void LedController::endConfirmWait()
{
    if (_state == LED_STATE_CONFIRM_WAIT)
    {
        _state = LED_STATE_WAIT_FOR_CARD;
    }
}

void LedController::runConfirmWait()
{
    const LedFeedback::Action action = LedFeedback::actionFor(LedFeedback::Pattern::ConfirmWait, _confirmWaitWindowMs);
    const uint32_t elapsed = millis() - _confirmWaitStartMs;
    if (LedFeedback::finished(action, elapsed))
    {
        _state = LED_STATE_WAIT_FOR_CARD;
        return;
    }
    LedFeedback::render(_strip, action, elapsed);
}

// Reserved / warning share the pure renderer; returns true while the trigger is still running.
bool LedController::runFeedbackTrigger(uint32_t elapsed)
{
    const LedFeedback::Action action = LedFeedback::actionFor(
        _trigger == TRIGGER_RESERVED ? LedFeedback::Pattern::Reserved : LedFeedback::Pattern::Warning);
    if (LedFeedback::finished(action, elapsed))
    {
        if (_trigger == TRIGGER_RESERVED && _blockedAfterReserved)
        {
            _blockedAfterReserved = false;
            _trigger = TRIGGER_ERROR;
            _triggerStartMs = millis();
            return false;
        }
        _trigger = TRIGGER_NONE;
        _state = _stateBeforeTrigger;
        return false;
    }
    const uint16_t n = _strip.numPixels();
    for (uint16_t i = 0; i < n; i++)
    {
        const uint32_t rgb = LedFeedback::pixelColor(action, elapsed, i, n);
        _strip.setPixelColor(i, _strip.Color((uint8_t)(rgb >> 16), (uint8_t)(rgb >> 8), (uint8_t)rgb));
    }
    return true;
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

        case TRIGGER_RESERVED:
        case TRIGGER_WARNING:
            if (!runFeedbackTrigger(elapsed))
            {
                setAll(0);
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

    if (_state == LED_STATE_CONFIRM_WAIT)
    {
        runConfirmWait();
        return;
    }

    runAnimation();
    _strip.show();
}

// Eight colour segments the admin compares with the approval dialog (layout and reading order: see
// led_pattern.hpp). No current pattern (disconnected, stale) breathes white.
void LedController::runEnrollmentPending()
{
    const uint16_t n = _strip.numPixels();
    portENTER_CRITICAL(&_enrollmentPatternLock);
    const bool showPattern = _showEnrollmentPattern;
    uint8_t pattern[LedPattern::SEGMENT_COUNT];
    for (size_t i = 0; i < LedPattern::SEGMENT_COUNT; i++)
    {
        pattern[i] = _enrollmentPattern[i];
    }
    portEXIT_CRITICAL(&_enrollmentPatternLock);
    if (showPattern)
    {
        const uint32_t now = millis();
        for (uint16_t i = 0; i < n; i++)
        {
            const uint32_t rgb = LedPattern::pixelColor(pattern, n, i, now);
            _strip.setPixelColor(i, _strip.Color((uint8_t)(rgb >> 16), (uint8_t)(rgb >> 8), (uint8_t)rgb));
        }
        return;
    }
    setAll(dim(_strip.Color(255, 255, 255), idleBreathBrightness()));
}

// Brightness of the slow idle breathing at the current animation phase.
uint8_t LedController::idleBreathBrightness() const
{
    uint16_t p = _phase % IDLE_BREATH_CYCLE;
    return (p < IDLE_BREATH_HALF)
        ? (IDLE_BRIGHTNESS_MIN + (uint8_t)(IDLE_BRIGHTNESS_RANGE * p / IDLE_BREATH_HALF))
        : (IDLE_BRIGHTNESS_MAX - (uint8_t)(IDLE_BRIGHTNESS_RANGE * (p - IDLE_BREATH_HALF) / IDLE_BREATH_HALF));
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
        uint8_t b = idleBreathBrightness();
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

    case LED_STATE_ENROLLMENT_PENDING:
        runEnrollmentPending();
        break;

    case LED_STATE_CONFIRM_WAIT:
        runConfirmWait();
        break;

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

    case LED_STATE_ENROLLMENT_PENDING:
        runEnrollmentPending();
        break;

    case LED_STATE_CONFIRM_WAIT:
        runConfirmWait();
        break;

    case LED_STATE_FIRMWARE_UPDATE:
        break;
    }
}

#endif

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
