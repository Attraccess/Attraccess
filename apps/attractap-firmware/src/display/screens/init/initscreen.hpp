#pragma once

#include <lvgl.h>
#include "../../images/logo_400w_png.hpp"
#include "../IScreen.hpp"
#include <Arduino.h>
#include <functional>
#include "../../../state/state.hpp"

class InitScreen : public IScreen
{
public:
    void init();
    void onScreenLeave();
    lv_obj_t *getScreen() override;
    void loop() override;
    String getName() override;

    void setOnOpenSettingsCallback(std::function<void()> onOpenSettingsCallback);

private:
    std::function<void()> onOpenSettingsCallback;
    lv_obj_t *screen;
    void finalizeState(lv_obj_t *spinner, lv_obj_t *label, lv_color_t color);
    void markStateAsSuccess(lv_obj_t *spinner, lv_obj_t *label);
    void markStateAsError(lv_obj_t *spinner, lv_obj_t *label);
    void resetState(lv_obj_t *spinner, lv_obj_t *label);

    static void onOpenSettingsButtonEvent(lv_event_t *e);

    lv_obj_t *wifiSpinner;
    lv_obj_t *wifiLabel;

    lv_obj_t *ethernetSpinner;
    lv_obj_t *ethernetLabel;

    lv_obj_t *apiConnectionSpinner;
    lv_obj_t *apiConnectionLabel;

    lv_obj_t *apiAuthenticationSpinner;
    lv_obj_t *apiAuthenticationLabel;
};