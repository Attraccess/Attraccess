#pragma once

#include "../../include/lv_conf.h"

// Keep firmware widgets, fonts, color depth and draw features; replace only HAL needs.
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
#undef LV_FONT_MONTSERRAT_18
#define LV_FONT_MONTSERRAT_18 1
#undef LV_FONT_DEFAULT
#define LV_FONT_DEFAULT &lv_font_montserrat_18
