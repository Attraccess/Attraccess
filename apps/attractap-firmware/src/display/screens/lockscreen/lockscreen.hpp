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
    lv_obj_t *getScreen() override;
    void loop() override;
    String getName() override;

    void setResourceName(const char *resourceName);
    void setUsageInfo(bool hasActiveUsage, const char *username);

private:
    lv_obj_t *screen;

    lv_obj_t *resourceNameLabel;
    lv_obj_t *usageInfoLabel;

    char resourceName[API::MAX_RESOURCE_NAME_LEN];
    char username[API::MAX_USERNAME_LEN];
    bool hasActiveUsage;

    void updateUsageInfo();
};