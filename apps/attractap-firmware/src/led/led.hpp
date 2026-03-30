#pragma once

#ifdef HAS_WS2812_LED

#include <Arduino.h>
#include <Adafruit_NeoPixel.h>

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
    };

    LedController() : _strip(WS2812_LED_COUNT, PIN_WS2812_DATA, NEO_GRB + NEO_KHZ800) {}
    void setup();
    void loop();

    void setState(LedState state);
    void triggerSuccess();
    void triggerError();
    void triggerIndicate();

private:
    void runAnimation();
    void runCircularAnimation();
    void runLinearAnimation();
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

    bool _firmwarePatternSet = false;
    Adafruit_NeoPixel _strip;

    static constexpr uint32_t ANIM_INTERVAL_MS = 50;
    static constexpr uint32_t TRIGGER_DURATION_MS = 400;
    static constexpr uint32_t TRIGGER_ERROR_FLASH_MS = 100;
};

#endif
