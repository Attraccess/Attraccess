#pragma once

#include <Arduino.h>
#include <NeoPixelBus.h>
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

    Neopixel() : logger("Neopixel"), leds(static_cast<uint16_t>(LED_COUNT), static_cast<uint8_t>(PIN_NEOPIXEL_LED)) {}

    void setup();
    void loop();

private:
    static const int LED_COUNT = 8;

    using crgb_t = uint32_t; // 0xRRGGBB packed color

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

    // LED hardware state (WS2812/GRB on ESP32 RMT channel 0)
    NeoPixelBus<NeoGrbFeature, NeoEsp32Rmt0Ws2812xMethod> leds;
    // Off-screen framebuffer for composing each animation frame
    crgb_t frame[LED_COUNT];
    crgb_t currentColor;
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