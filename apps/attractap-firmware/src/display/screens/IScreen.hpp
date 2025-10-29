#pragma once

#include <lvgl.h>
#include <Arduino.h>

class IScreen
{
public:
    virtual void init() = 0;
    virtual void loop() = 0;
    virtual String getName() = 0;
    virtual lv_obj_t *getScreen() = 0;
};