#pragma once

#include <lvgl.h>
#include "logo_400w_png.cpp"
#include "../IScreen.hpp"
#include <Arduino.h>
#include <functional>

class InitScreen : public IScreen
{
public:
    void init();
    lv_obj_t *getScreen() override;
    void loop() override;
    void setOnOpenSettingsCallback(std::function<void()> onOpenSettingsCallback);

private:
    std::function<void()> onOpenSettingsCallback;
    lv_obj_t *screen;
    void finalizeState(lv_obj_t *spinner, lv_obj_t *label, lv_color_t color);
    void markStateAsSuccess(lv_obj_t *spinner, lv_obj_t *label);
    void markStateAsError(lv_obj_t *spinner, lv_obj_t *label);

    void markWifiStateAsSuccess();
    void markWifiStateAsError();
    void markEthernetStateAsSuccess();
    void markEthernetStateAsError();
    void markApiConnectionStateAsSuccess();
    void markApiConnectionStateAsError();
    void markApiAuthenticationStateAsSuccess();
    void markApiAuthenticationStateAsError();

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