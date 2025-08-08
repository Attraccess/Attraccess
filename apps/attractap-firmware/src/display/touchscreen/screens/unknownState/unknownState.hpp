#pragma once

#include "../iScreen.hpp"
#include "../../../../logger/logger.hpp"
#include <Arduino.h>

class UnknownStateScreen : public IScreen
{
public:
    UnknownStateScreen();
    void onScreenEnter() override;
    void onScreenExit() override;
    void loop() override;
    lv_obj_t *getScreen() override;

private:
    lv_obj_t *screen;
    bool initialized;
    void initialize();
    Logger logger;
};