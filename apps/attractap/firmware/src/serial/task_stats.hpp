#pragma once

// FreeRTOS per-task run-time stats for the `debug.stats` serial topic (ATT-1276).
// Compiled only when run-time stats are on (sdkconfig.debug, sdkconfig.lab-stats), i.e.
// never in release images; tools/check_release_build.py enforces that.
#if !defined(ATTRACTAP_HOST) && !defined(ATTRACTAP_SECURE_PROFILE)
#include "sdkconfig.h"
#if defined(CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS) && defined(CONFIG_FREERTOS_USE_TRACE_FACILITY)
#define ATTRACTAP_TASK_STATS 1

namespace TaskStats
{
// Logs one table row per task (name, run time, CPU %, stack high-water mark, core) at INFO.
void log();
} // namespace TaskStats
#endif
#endif
