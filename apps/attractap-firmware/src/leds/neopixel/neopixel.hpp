#pragma once

#include <Arduino.h>
#include <FastLED.h>
#include "task_priorities.h"
#include "../../logger/logger.hpp"
#include "../../state/state.hpp"

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

    Neopixel() : logger("Neopixel") {}

    void setup();

private:
    static const int LED_COUNT = 8;

    static void taskFn(void *parameter);
    void loop();
    void updateAppStateData();
    void updateApiEventData();
    void runAnimation();
    void runWaitingForNetworkAnimation();
    void runWaitingForWebsocketConnectionAnimation();
    void runWaitingForApiAuthenticationAnimation();
    void runDisplayErrorAnimation();
    void runDisplaySuccessAnimation();
    void runDisplayTextAnimation();
    void runConfirmActionAnimation();
    void runResourceSelectionAnimation();
    void runWaitForProcessingAnimation();
    void runWaitForNfcTapAnimation();
    void runFirmwareUpdateAnimation();

    // LED hardware state
    CRGB leds[LED_COUNT];
    CRGB currentColor;
    int currentInterval;
    NEOPIXEL_STATE currentState;
    unsigned long lastUpdate;
    bool ledsAreOn;

    State::NetworkState networkState;
    State::WebsocketState websocketState;
    State::ApiState apiState;
    State::ApiEventData apiEventData;
    uint32_t lastApiEventTime;
    uint32_t lastKnownStateChangeTime;

    // Logger instance
    Logger logger;
};