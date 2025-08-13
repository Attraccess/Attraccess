#pragma once

#include <lvgl.h>
#include <Arduino.h>
#include "../iScreen.hpp"
#include <esp_netif.h>
#include "state/state.hpp"
#include "../../../../logger/logger.hpp"

class WaitForConnectionScreen : public IScreen
{
public:
    WaitForConnectionScreen();
    void onScreenEnter() override;
    void onScreenExit() override;
    void loop() override;
    void onDataChange(State::NetworkState networkState, State::WebsocketState webSocketState, State::ApiState apiState, State::ApiEventData apiEventData) override;
    lv_obj_t *getScreen() override;

private:
    lv_obj_t *screen;

    lv_obj_t *currentStatusLabel;
    lv_obj_t *currentStatusDetailLabel;

    bool initialized;

    // dot animation state (single synchronized animation)
    static const int DOT_COUNT = 5;
    lv_obj_t *dots[DOT_COUNT];
    int16_t dotXOffsets[DOT_COUNT];
    int16_t dotsBaseYOffset;
    int16_t dotsAmplitude;
    int32_t dotsAnimDurationMs;

    static void dotsAnimExecCb(void *var, int32_t v);
    void startDotsAnimation();

    void initialize();
    Logger logger;
};