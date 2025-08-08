#pragma once

#include "../iScreen.hpp"
#include "../../../../logger/logger.hpp"
#include <Arduino.h>

class MessageScreen : public IScreen
{
public:
    MessageScreen();
    void onScreenEnter() override;
    void onScreenExit() override;
    void loop() override;
    lv_obj_t *getScreen() override;

    void setMessage(String lineOne, lv_color_t lineOneColor);
    void setMessage(String lineOne, lv_color_t lineOneColor, String lineTwo, lv_color_t lineTwoColor);

private:
    lv_obj_t *screen;
    lv_obj_t *lineOneLabel;
    lv_obj_t *lineTwoLabel;
    bool initialized;
    void initialize();
    Logger logger;
};