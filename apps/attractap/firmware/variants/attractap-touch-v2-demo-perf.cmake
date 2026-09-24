# Temporary diagnostic variant: attractap-touch-v2-demo + LVGL perf monitor.
# Enables LV_USE_PERF_MONITOR_LOG_MODE so FPS/render/flush timing is logged to
# serial (PERFORMANCE_ANALYSIS.md A-4). For on-hardware measurement only.
set(ATTRACTAP_VARIANT_PARENT "attractap-touch-v2-demo")
include("${CMAKE_CURRENT_LIST_DIR}/${ATTRACTAP_VARIANT_PARENT}.cmake")

set(ATTRACTAP_FIRMWARE_NAME "attractap_touch_v2_demo_perf")
set(ATTRACTAP_FIRMWARE_FRIENDLY_NAME "Attractap Touch V2 Demo (perf)")
set(ATTRACTAP_FIRMWARE_VARIANT "demo")
set(ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME "Demo")

# Replace the parent identity definitions for direct IDF builds.
list(FILTER ATTRACTAP_DEFINES EXCLUDE REGEX "^FIRMWARE_(NAME|FRIENDLY_NAME)=")
list(APPEND ATTRACTAP_DEFINES
    FIRMWARE_NAME="${ATTRACTAP_FIRMWARE_NAME}"
    FIRMWARE_FRIENDLY_NAME="${ATTRACTAP_FIRMWARE_FRIENDLY_NAME}"
    ATTRACTAP_LV_PERF_MONITOR=1)

# Also reach LVGL's own compilation (lv_conf.h gates sysmon on this define).
set(ATTRACTAP_LV_PERF_MONITOR_GL 1)
