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
    void destroy() override;

    void setOnOpenSettingsCallback(std::function<void()> onOpenSettingsCallback);

private:
    std::function<void()> onOpenSettingsCallback;
    lv_obj_t *screen = nullptr;
    void finalizeState(lv_obj_t *spinner, lv_obj_t *label, lv_color_t color);
    void markStateAsSuccess(lv_obj_t *spinner, lv_obj_t *label);
    void markStateAsError(lv_obj_t *spinner, lv_obj_t *label);
    void markStateAsWarning(lv_obj_t *spinner, lv_obj_t *label);
    void resetState(lv_obj_t *spinner, lv_obj_t *label);

    static void onOpenSettingsButtonEvent(lv_event_t *e);

    static String formatIp(esp_ip4_addr_t ip);

    lv_obj_t *wifiSpinner = nullptr;
    lv_obj_t *wifiLabel = nullptr;

    lv_obj_t *ethernetSpinner = nullptr;
    lv_obj_t *ethernetLabel = nullptr;

    lv_obj_t *apiConnectionSpinner = nullptr;
    lv_obj_t *apiConnectionLabel = nullptr;

    lv_obj_t *apiAuthenticationSpinner = nullptr;
    lv_obj_t *apiAuthenticationLabel = nullptr;

    // Connection / cert-detection progress detail lines.
    lv_obj_t *serverTargetLabel = nullptr;
    lv_obj_t *certLabel = nullptr;
    lv_obj_t *connectionStateLabel = nullptr;
};