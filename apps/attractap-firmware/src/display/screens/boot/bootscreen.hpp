#pragma once

#include <lvgl.h>
#include "../IScreen.hpp"
#include <Arduino.h>

class BootScreen : public IScreen
{
public:
    void init();
    lv_obj_t *getScreen() override;
    void loop() override;
    String getName() override;

private:
    lv_obj_t *screen;
};