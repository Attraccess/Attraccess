#pragma once

#include "../iScreen.hpp"
#include "../../../../logger/logger.hpp"
#include <Arduino.h>

class NfcTapScreen : public IScreen
{
public:
    NfcTapScreen();
    void onScreenEnter() override;
    void onScreenExit() override;
    void loop() override;
    lv_obj_t *getScreen() override;

    void setMessage(String message);

private:
    lv_obj_t *screen;
    lv_obj_t *label;
    bool initialized;
    void initialize();
    Logger logger;
};