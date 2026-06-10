/**
 * @file lv_conf.h
 * LVGL v9 configuration for Attractap (lvgl@9.3.0, see platformio.ini).
 *
 * IMPORTANT: this file must use LVGL v9 macro names. LVGL silently ignores
 * unknown (e.g. v8) macros and falls back to its defaults — the previous v8.4
 * config left the device running at the v9 defaults (33 ms refresh, ~30 Hz
 * touch sampling) for its entire life (ATT-554). Only deliberate overrides are
 * listed here; everything else intentionally uses the lv_conf_internal.h
 * defaults.
 */

/* clang-format off */
#if 1 /*Set it to "1" to enable content*/

#ifndef LV_CONF_H
#define LV_CONF_H

/*====================
   COLOR SETTINGS
 *====================*/

/*Color depth: 8 (A8), 16 (RGB565), 24 (RGB888), 32 (XRGB8888)*/
#define LV_COLOR_DEPTH 16

/*=========================
   MEMORY SETTINGS
 *=========================*/

/*Built-in lv_malloc pool (the effective setting since the v9 migration; kept explicit)*/
#define LV_USE_STDLIB_MALLOC LV_STDLIB_BUILTIN
#define LV_MEM_SIZE (64 * 1024U)

/*====================
   HAL SETTINGS
 *====================*/

/*Default display refresh AND input-device read period. In v9 a single macro
 *drives both: lv_indev_create() also uses LV_DEF_REFR_PERIOD for its read
 *timer (lv_indev.c). 15 ms ≈ 66 Hz refresh + touch sampling (v9 default: 33 ms).*/
#define LV_DEF_REFR_PERIOD 15

/*=========================
   OPERATING SYSTEM
 *=========================*/

/*FreeRTOS primitives: enables lv_lock()/lv_unlock() (recursive mutex) so
 *lv_timer_handler can run on a dedicated task, and allows >1 SW draw unit.*/
#define LV_USE_OS LV_OS_FREERTOS

/*========================
 * RENDERING CONFIGURATION
 *========================*/

/*Two software draw units: the ESP32-S3 has two cores, so render work on
 *independent areas can be parallelized. Requires LV_USE_OS above.*/
#define LV_DRAW_SW_DRAW_UNIT_CNT 2

/*-------------
 * Logging
 *-----------*/

#define LV_USE_LOG 1
#if LV_USE_LOG
    #define LV_LOG_LEVEL LV_LOG_LEVEL_ERROR
    /*Fallback printf; Display::setup registers a print callback that takes precedence*/
    #define LV_LOG_PRINTF 1
#endif

/*-------------
 * Asserts
 *-----------*/

#define LV_USE_ASSERT_NULL   1
#define LV_USE_ASSERT_MALLOC 1

/*-------------
 * Debug
 *-----------*/

/*FPS/CPU overlay for on-hardware perf validation (ATT-554). Enable by adding
 *`-D ATTRACTAP_LV_PERF_MONITOR=1` to build_flags.*/
#ifdef ATTRACTAP_LV_PERF_MONITOR
    #define LV_USE_SYSMON 1
    #define LV_USE_PERF_MONITOR 1
    #define LV_USE_PERF_MONITOR_POS LV_ALIGN_BOTTOM_RIGHT
#endif

/*==================
 *   FONT USAGE
 *===================*/

#define LV_FONT_MONTSERRAT_10 1
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_18 1
#define LV_FONT_MONTSERRAT_24 1
#define LV_FONT_MONTSERRAT_26 1
#define LV_FONT_MONTSERRAT_28 1
#define LV_FONT_MONTSERRAT_32 1
#define LV_FONT_MONTSERRAT_36 1
#define LV_FONT_MONTSERRAT_48 1

#define LV_FONT_DEFAULT &lv_font_montserrat_18

/*==================
 *  WIDGETS / THEMES
 *================*/

/*v9 defaults (all widgets + default theme enabled) — matches what the firmware
 *has effectively been running since the v9 migration. Do not trim without
 *re-testing every screen.*/

/*--END OF LV_CONF_H--*/

#endif /*LV_CONF_H*/

#endif /*End of "Content enable"*/
