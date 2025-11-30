#pragma once

#include <Arduino.h>
#include <lvgl.h>
#include "../../images/lockscreen_background_image.hpp"
#include "../../images/logo_40h.hpp"
#include "../IScreen.hpp"
#include "../../../api/api.hpp"

class Lockscreen : public IScreen
{
public:
    void init();
    void onScreenLeave();
    lv_obj_t *getScreen() override;
    void loop() override;
    String getName() override;
    void destroy() override;

    void setResourceName(const char *resourceName);
    void setUsageInfo(bool hasActiveUsage, const char *username);

private:
    lv_obj_t *screen = nullptr;

    lv_obj_t *resourceNameLabel = nullptr;
    lv_obj_t *usageInfoLabel = nullptr;

    char resourceName[API::MAX_RESOURCE_NAME_LEN];
    char username[API::MAX_USERNAME_LEN];
    bool hasActiveUsage;

    void updateUsageInfo();
};