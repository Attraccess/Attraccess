#include "task_stats.hpp"

#ifdef ATTRACTAP_TASK_STATS

#include <cstdint>
#include <cstdio>
#include <cstdlib>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "../logger/logger.hpp"

namespace
{
Logger logger("TaskStats");

constexpr UBaseType_t SNAPSHOT_ATTEMPTS = 3;
// Tasks created between counting and snapshotting still fit.
constexpr UBaseType_t SNAPSHOT_SLACK = 4;
constexpr size_t ROW_BYTES = 96;
// The USB-Serial-JTAG console drops lines written back to back (the table is also larger than the 1 KB TX ring
// buffer in main.cpp). A short pause before every line lets the host drain it; measured on a Touch V2.
constexpr TickType_t LINE_PAUSE_TICKS = pdMS_TO_TICKS(20);
} // namespace

void TaskStats::log()
{
    TaskStatus_t *status = nullptr;
    UBaseType_t reported = 0;
    // 64-bit with sdkconfig.lab-stats/.debug (CONFIG_FREERTOS_RUN_TIME_COUNTER_TYPE_U64): a 32-bit counter wraps after 71 minutes.
    configRUN_TIME_COUNTER_TYPE totalRunTime = 0;

    // uxTaskGetSystemState returns 0 when the array is too small, so retry with a fresh
    // count if tasks were created meanwhile. The array is bounded: it never overruns.
    for (UBaseType_t attempt = 0; attempt < SNAPSHOT_ATTEMPTS && reported == 0; attempt++)
    {
        free(status);
        const UBaseType_t capacity = uxTaskGetNumberOfTasks() + SNAPSHOT_SLACK;
        status = static_cast<TaskStatus_t *>(malloc(capacity * sizeof(TaskStatus_t)));
        if (!status)
        {
            logger.error("debug.stats unavailable: unable to allocate task snapshot");
            return;
        }
        reported = uxTaskGetSystemState(status, capacity, &totalRunTime);
    }
    if (reported == 0)
    {
        logger.error("debug.stats unavailable: unable to capture task snapshot");
        free(status);
        return;
    }

    // The run-time counter ticks once for the whole chip; each core can use all of it.
    const uint64_t cpuTime = static_cast<uint64_t>(totalRunTime) * portNUM_PROCESSORS;

    // Also before the header: it follows the "Handling command" line back to back and was dropped about a third of the time.
    vTaskDelay(LINE_PAUSE_TICKS);
    logger.infof("--- FreeRTOS run-time stats (%u tasks, total %llu ticks) ---", (unsigned)reported,
                 (unsigned long long)totalRunTime);
    vTaskDelay(LINE_PAUSE_TICKS);
    logger.info("Task                 Runtime       CPU  StackHWM  Core");
    vTaskDelay(LINE_PAUSE_TICKS);
    for (UBaseType_t i = 0; i < reported; i++)
    {
        const TaskStatus_t &task = status[i];
        char row[ROW_BYTES];
        const unsigned percentTenths =
            cpuTime == 0 ? 0 : static_cast<unsigned>((static_cast<uint64_t>(task.ulRunTimeCounter) * 1000) / cpuTime);
        char core[12];
        if (task.xCoreID == tskNO_AFFINITY)
        {
            snprintf(core, sizeof(core), "any");
        }
        else
        {
            snprintf(core, sizeof(core), "%d", (int)task.xCoreID);
        }
        const int written = snprintf(row, sizeof(row), "%-16.16s %10llu %4u.%u%% %9u  %s", task.pcTaskName,
                                     (unsigned long long)task.ulRunTimeCounter, percentTenths / 10, percentTenths % 10,
                                     (unsigned)task.usStackHighWaterMark, core);
        if (written < 0 || static_cast<size_t>(written) >= sizeof(row))
        {
            logger.warn("debug.stats: row truncated");
        }
        logger.info(row);
        vTaskDelay(LINE_PAUSE_TICKS);
    }
    logger.info("--- end of run-time stats ---");
    free(status);
}

#endif
