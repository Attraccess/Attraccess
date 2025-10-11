#pragma once

#include <lvgl.h>

class IScreen
{
public:
    virtual void loop() = 0;
    virtual lv_obj_t *getScreen() = 0;
};