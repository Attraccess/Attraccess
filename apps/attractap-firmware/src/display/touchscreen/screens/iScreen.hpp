#pragma once

#include <lvgl.h>

class IScreen
{
public:
    IScreen() {}

    virtual void onScreenEnter() = 0;
    virtual void onScreenExit() = 0;
    virtual void loop() = 0;
    virtual lv_obj_t *getScreen() = 0;
};