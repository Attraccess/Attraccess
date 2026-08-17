# Temporary diagnostic variant: attractap-touch-v2-demo + LVGL perf monitor.
# Enables LV_USE_PERF_MONITOR_LOG_MODE so FPS/render/flush timing is logged to
# serial (PERFORMANCE_ANALYSIS.md A-4). For on-hardware measurement only.
set(ATTRACTAP_VARIANT_PARENT "attractap-touch-v2-demo")
include("${CMAKE_CURRENT_LIST_DIR}/${ATTRACTAP_VARIANT_PARENT}.cmake")

set(ATTRACTAP_FIRMWARE_NAME "attractap_touch_v2_demo_perf")
set(ATTRACTAP_FIRMWARE_FRIENDLY_NAME "Attractap Touch V2 Demo (perf)")

list(APPEND ATTRACTAP_DEFINES ATTRACTAP_LV_PERF_MONITOR=1)

# Also reach LVGL's own compilation (lv_conf.h gates sysmon on this define).
set(ATTRACTAP_LV_PERF_MONITOR_GL 1)
