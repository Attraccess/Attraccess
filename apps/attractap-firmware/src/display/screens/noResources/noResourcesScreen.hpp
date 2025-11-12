#pragma once

#include "../IScreen.hpp"
#include "../../images/lockscreen_background_image.hpp"
#include "../../../state/state.hpp"

class NoResourcesScreen : public IScreen
{
public:
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    String getName() override;

private:
    lv_obj_t *screen;
};