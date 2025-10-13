#pragma once

#include "../IScreen.hpp"
#include "../../images/lockscreen_background_image.hpp"

class NoResourcesScreen : public IScreen
{
public:
    void init();
    void loop() override;
    lv_obj_t *getScreen() override;

private:
    lv_obj_t *screen;
};