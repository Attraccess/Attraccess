#pragma once

#include <string>
#include <lvgl.h>
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
    std::string getName() override;
    void destroy() override;

    /* The lockscreen is re-entered on every card removal / session end, so
     * keeping its LVGL tree alive avoids the destroy+rebuild cost per
     * transition (PERFORMANCE_ANALYSIS.md M4: hot screens persistent). */
    bool shouldAutoUnload() const override { return false; }

    void setResourceName(const char *resourceName);
    void setUsageInfo(bool hasActiveUsage, const char *username, bool isUnderMaintenance);

private:
    lv_obj_t *screen = nullptr;

    lv_obj_t *resourceNameLabel = nullptr;
    lv_obj_t *usageInfoLabel = nullptr;

    char resourceName[API::MAX_RESOURCE_NAME_LEN];
    char username[API::MAX_USERNAME_LEN];
    bool hasActiveUsage;
    bool isUnderMaintenance;

    void updateUsageInfo();
};
