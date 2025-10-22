#pragma once

#include <Arduino.h>
#include <lvgl.h>
#include "../../images/lockscreen_background_image.hpp"
#include "../../images/logo_400w_png.hpp"
#include "../IScreen.hpp"

class Lockscreen : public IScreen
{
public:
    void init();
    lv_obj_t *getScreen() override;
    void loop() override;
    String getName() override;

private:
    lv_obj_t *screen;
};