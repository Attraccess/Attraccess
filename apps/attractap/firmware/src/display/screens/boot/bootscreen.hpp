#pragma once

#include <lvgl.h>
#include "../IScreen.hpp"
#include <string>

class BootScreen : public IScreen
{
public:
    void init();
    void onScreenLeave();
    lv_obj_t *getScreen() override;
    void loop() override;
    std::string getName() override;
    void destroy() override;

private:
    lv_obj_t *screen = nullptr;
};
