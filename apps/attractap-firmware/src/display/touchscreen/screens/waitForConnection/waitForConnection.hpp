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
    void onScreenEnter();
    void onScreenExit();
    void loop();
    lv_obj_t *getScreen();

private:
    lv_obj_t *screen;
    State appState;
    uint32_t lastKnownAppStateChangeTime;

    lv_obj_t *currentStatusLabel;
    lv_obj_t *currentStatusDetailLabel;

    bool initialized;

    void initialize();
    void updateStatus();
    Logger logger;
};