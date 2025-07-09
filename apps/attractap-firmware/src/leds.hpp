#pragma once

#include <Arduino.h>
#include <FastLED.h>

#include "configs/attractap.h"

enum LED_STATE
{
    LED_STATE_OFF,
    LED_STATE_ON,
    LED_STATE_BLINKING,
    LED_STATE_BREATHING,
};

class Leds
{
public:
    Leds() {}

    void setup();
    void loop();

    void setOff();
    void setOn(CRGB color);
    void setBlinking(CRGB color, int interval);
    void setBreathing(CRGB color, int interval);

private:
    CRGB leds[LED_COUNT];
    CRGB currentColor;
    int currentInterval;
    LED_STATE currentState;
    TaskHandle_t taskHandle;
    unsigned long lastUpdate;
    bool ledsAreOn;

    void updateAnimationOff();
    void updateAnimationOn();
    void updateAnimationBlinking();
    void updateAnimationBreathing();
};