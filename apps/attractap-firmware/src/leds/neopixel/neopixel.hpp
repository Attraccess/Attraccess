#pragma once

#include <Arduino.h>
#include <FastLED.h>
#include "task_priorities.h"
#include "../../logger/logger.hpp"

class Neopixel
{
public:
    enum NEOPIXEL_STATE
    {
        NEOPIXEL_STATE_OFF,
        NEOPIXEL_STATE_ON,
        NEOPIXEL_STATE_BLINKING,
        NEOPIXEL_STATE_BREATHING,
    };

    enum DISPLAY_STATE
    {
        DISPLAY_STATE_NONE,
        DISPLAY_STATE_CARD_CHECKING,
        DISPLAY_STATE_ERROR,
        DISPLAY_STATE_SUCCESS,
        DISPLAY_STATE_TEXT,
        DISPLAY_STATE_SELECT_ITEM,
        DISPLAY_STATE_CONFIRM_ACTION,
    };

    Neopixel() : is_network_connected(false), is_api_connected(false), current_display_state(DISPLAY_STATE_NONE), logger("Neopixel") {}

    void setup();

    // State update methods
    void setNetworkConnected(bool connected);
    void setApiConnected(bool connected);
    void setDisplayState(DISPLAY_STATE state);

    // Manual control methods (for backward compatibility or special cases)
    void setOff();
    void setOn(CRGB color);
    void setBlinking(CRGB color, int interval);
    void setBreathing(CRGB color, int interval);

private:
    static void taskFn(void *parameter);
    void loop();
    void updateStateBasedLeds();

    // LED hardware state
    CRGB leds[LED_COUNT];
    CRGB currentColor;
    int currentInterval;
    NEOPIXEL_STATE currentState;
    unsigned long lastUpdate;
    bool ledsAreOn;

    // System state tracking
    bool is_network_connected;
    bool is_api_connected;
    DISPLAY_STATE current_display_state;

    // Logger instance
    Logger logger;

    void updateAnimationOff();
    void updateAnimationOn();
    void updateAnimationBlinking();
    void updateAnimationBreathing();
};