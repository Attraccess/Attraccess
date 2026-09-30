#pragma once

#include <string>

#include "../IScreen.hpp"
#include "../../../state/state.hpp"

class NoResourcesScreen : public IScreen
{
public:
    void init();
    void onScreenLeave();
    void loop() override;
    lv_obj_t *getScreen() override;
    std::string getName() override;
    void destroy() override;

private:
    lv_obj_t *screen = nullptr;
};
