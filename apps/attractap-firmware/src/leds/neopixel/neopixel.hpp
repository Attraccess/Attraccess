#pragma once

#define FASTLED_RMT_BUILTIN_DRIVER 0
#define FASTLED_FORCE_SOFTWARE_SPI
#define FASTLED_FORCE_SOFTWARE_PINS

#include <Arduino.h>
#include <FastLED.h>
#include "task_priorities.h"
#include "../../logger/logger.hpp"
#include "../../state/state.hpp"

class Neopixel
{
public:
    Neopixel() : logger("Neopixel"), nfcAnimationActivated(false) {}

    void setup();
    void loop();

private:
    static const int LED_COUNT = 8;

    static void taskFn(void *parameter);
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

    void nfcAnimationWorkaround();
    bool nfcAnimationActivated;

    // FastLED strip buffer (WS2812B / GRB)
    CRGB ledStrip[LED_COUNT];

    State::NetworkState networkState;
    State::WebsocketState websocketState;
    State::ApiState apiState;
    State::ApiEventData apiEventData;
    uint32_t lastApiEventTime;
    uint32_t lastKnownStateChangeTime;

    // Logger instance
    Logger logger;
};