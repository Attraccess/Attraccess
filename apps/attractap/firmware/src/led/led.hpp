#pragma once

#ifdef HAS_WS2812_LED

#include <cstdint>
#include "freertos/FreeRTOS.h"
#include "led_pattern.hpp"
#include "ws2812_strip.hpp"

class LedController
{
public:
    enum LedState
    {
        LED_STATE_CONFIG_REQUIRED,
        LED_STATE_INIT,
        LED_STATE_WAIT_FOR_CARD,
        LED_STATE_AUTHENTICATE_CARD,
        LED_STATE_NO_RESOURCES,
        LED_STATE_FIRMWARE_UPDATE,
        LED_STATE_ENROLLMENT_PENDING,
    };

    LedController() : _strip(WS2812_LED_COUNT, PIN_WS2812_DATA) {}
    void setup();
    void loop();

    void setState(LedState state);
    void setBrightness(uint8_t brightness);
    // Colour indices (LedPattern, one per segment) to match while LED_STATE_ENROLLMENT_PENDING.
    // showPattern false (no current pattern: disconnected or stale): breathe white.
    void setEnrollmentPattern(bool showPattern, const uint8_t *pattern);
    void triggerSuccess();
    void triggerError();
    void triggerIndicate();

private:
    void runAnimation();
    void runCircularAnimation();
    void runLinearAnimation();
    void runEnrollmentPending();
    uint8_t idleBreathBrightness() const;
    void setAll(uint32_t color);
    bool isCircularRing() const;
    uint16_t wrapIndex(int16_t i) const;
    uint32_t wheel(uint8_t pos);
    uint32_t dim(uint32_t color, uint8_t factor);

    LedState _state = LED_STATE_INIT;
    uint32_t _lastUpdateMs = 0;
    uint16_t _phase = 0;

    enum TriggerType
    {
        TRIGGER_NONE,
        TRIGGER_SUCCESS,
        TRIGGER_ERROR,
        TRIGGER_INDICATE,
    };
    TriggerType _trigger = TRIGGER_NONE;
    uint32_t _triggerStartMs = 0;
    LedState _stateBeforeTrigger = LED_STATE_WAIT_FOR_CARD;

    // Written by the application task, read by the LED task.
    portMUX_TYPE _enrollmentPatternLock = portMUX_INITIALIZER_UNLOCKED;
    bool _showEnrollmentPattern = false;
    uint8_t _enrollmentPattern[LedPattern::SEGMENT_COUNT] = {};
    bool _firmwarePatternSet = false;
    uint8_t _globalBrightness = 255;
    Ws2812Strip _strip;

    static constexpr uint32_t ANIM_INTERVAL_MS = 50;
    static constexpr uint32_t TRIGGER_DURATION_MS = 400;
    static constexpr uint32_t TRIGGER_ERROR_FLASH_MS = 100;

    static constexpr uint8_t IDLE_BRIGHTNESS_MIN = 8;
    static constexpr uint8_t IDLE_BRIGHTNESS_MAX = 38;
    static constexpr uint8_t IDLE_BRIGHTNESS_RANGE = IDLE_BRIGHTNESS_MAX - IDLE_BRIGHTNESS_MIN;
    static constexpr uint16_t IDLE_BREATH_CYCLE = 60;
    static constexpr uint16_t IDLE_BREATH_HALF = IDLE_BREATH_CYCLE / 2;
    static constexpr uint8_t IDLE_SEGMENT_COUNT = 6;
};

#endif
