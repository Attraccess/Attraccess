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

/*The fullscreen form keyboard needs more than the base UI's 64 KiB pool for
 *its button-label draw tasks. Keep this internal pool large enough to render
 *the editor without tripping LVGL's out-of-memory assertion.*/
#define LV_USE_STDLIB_MALLOC LV_STDLIB_BUILTIN
#define LV_MEM_SIZE (128 * 1024U)

/*====================
   HAL SETTINGS
 *====================*/

/*Default display refresh period. Touch sampling is decoupled to 10 ms in
 *Display::setup() (lv_indev_get_read_timer), so this only paces refresh.
 *24 ms ≈ 42 Hz matches the ST7701 panel cadence (12 MHz pclk / 480x480), so
 *simple-content frames aren't capped below the panel rate (less judder).
 *Complex screens still render as fast as they can (LVGL misses frames rather
 *than tearing) (PERFORMANCE_ANALYSIS.md Q5).*/
#define LV_DEF_REFR_PERIOD 24

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

/*FPS/CPU overlay for on-hardware perf validation (ATT-554). Enable by using
 *the attractap-touch-v2-demo-perf variant, which defines
 *ATTRACTAP_LV_PERF_MONITOR for both the app and LVGL itself (see CMakeLists
 *ATTRACTAP_LV_PERF_MONITOR_GL).*/
#ifdef ATTRACTAP_LV_PERF_MONITOR
    #define LV_USE_OBSERVER 1
    #define LV_USE_SYSMON 1
    #define LV_USE_PERF_MONITOR 1
    #define LV_USE_PERF_MONITOR_POS LV_ALIGN_BOTTOM_RIGHT
    /* Log FPS/render time to serial instead of drawing on the panel — lets us
     * measure Bildaufbau cost without a camera (PERFORMANCE_ANALYSIS.md A-4). */
    #define LV_USE_PERF_MONITOR_LOG_MODE 1
#endif

/*==================
 *   FONT USAGE
 *===================*/

#define LV_FONT_MONTSERRAT_10 1
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_16 1
#define LV_FONT_MONTSERRAT_18 1
#define LV_FONT_MONTSERRAT_20 1
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
