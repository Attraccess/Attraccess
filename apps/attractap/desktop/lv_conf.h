#pragma once

#include "../firmware/include/lv_conf.h"

// The simulator drives LVGL from one native event loop, not FreeRTOS.
#undef LV_USE_OS
#define LV_USE_OS LV_OS_NONE
#undef LV_DRAW_SW_DRAW_UNIT_CNT
#define LV_DRAW_SW_DRAW_UNIT_CNT 1
#undef LV_USE_STDLIB_MALLOC
#define LV_USE_STDLIB_MALLOC LV_STDLIB_CLIB
#undef LV_USE_SYSMON
#define LV_USE_SYSMON 0
#undef LV_USE_PERF_MONITOR
#define LV_USE_PERF_MONITOR 0
#undef LV_USE_MEM_MONITOR
#define LV_USE_MEM_MONITOR 0
