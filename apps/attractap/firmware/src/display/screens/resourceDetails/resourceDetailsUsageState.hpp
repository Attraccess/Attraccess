#pragma once
#include "../../../api/api.hpp"
#include <lvgl.h>

struct ResourceDetailsUsageState
{
protected:
    lv_obj_t *usageStatsContainer = nullptr;
    lv_obj_t *meterValue = nullptr;
    lv_obj_t *operatingValue = nullptr;
    API::UsageStats usageStats{};
    bool usageStatsValid = false;
    uint32_t usageStatsReceivedAt = 0;
};
