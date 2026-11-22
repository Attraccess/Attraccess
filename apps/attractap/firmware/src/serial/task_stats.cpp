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
// Header and rows share the column widths: name 16, run time 12 (µs since boot, about 11 days), CPU 6, HWM 9.
#define TASK_STATS_HEADER_FORMAT "%-16s %12s %6s %9s  %s"
#define TASK_STATS_ROW_FORMAT "%-16.16s %12llu %3u.%u%% %9u  %s"

// uxTaskGetSystemState returns 0 when the array is too small, so retry with a fresh count if tasks were created
// meanwhile. The array is bounded: it never overruns. Returns nullptr (and logs why) when no snapshot was taken.
TaskStatus_t *snapshot(UBaseType_t &reported, configRUN_TIME_COUNTER_TYPE &totalRunTime)
{
    TaskStatus_t *status = nullptr;
    reported = 0;
    for (UBaseType_t attempt = 0; attempt < SNAPSHOT_ATTEMPTS && reported == 0; attempt++)
    {
        free(status);
        const UBaseType_t capacity = uxTaskGetNumberOfTasks() + SNAPSHOT_SLACK;
        status = static_cast<TaskStatus_t *>(malloc(capacity * sizeof(TaskStatus_t)));
        if (!status)
        {
            logger.error("debug.stats unavailable: unable to allocate task snapshot");
            return nullptr;
        }
        reported = uxTaskGetSystemState(status, capacity, &totalRunTime);
    }
    if (reported == 0)
    {
        logger.error("debug.stats unavailable: unable to capture task snapshot");
        free(status);
        return nullptr;
    }
    return status;
}

void formatRow(const TaskStatus_t &task, uint64_t cpuTime, char *row)
{
    const unsigned percentTenths =
        cpuTime == 0 ? 0 : static_cast<unsigned>((static_cast<uint64_t>(task.ulRunTimeCounter) * 1000) / cpuTime);
    char core[12] = "-";
#if configTASKLIST_INCLUDE_COREID == 1
    // TaskStatus_t::xCoreID exists only with CONFIG_FREERTOS_VTASKLIST_INCLUDE_COREID.
    if (task.xCoreID == tskNO_AFFINITY)
    {
        snprintf(core, sizeof(core), "any");
    }
    else
    {
        snprintf(core, sizeof(core), "%d", (int)task.xCoreID);
    }
#endif
    const int written = snprintf(row, ROW_BYTES, TASK_STATS_ROW_FORMAT, task.pcTaskName,
                                 (unsigned long long)task.ulRunTimeCounter, percentTenths / 10, percentTenths % 10,
                                 (unsigned)task.usStackHighWaterMark, core);
    if (written < 0 || static_cast<size_t>(written) >= ROW_BYTES)
    {
        logger.error("debug.stats: row truncated");
    }
}
} // namespace

bool TaskStats::log()
{
    UBaseType_t reported = 0;
    // 64-bit with sdkconfig.lab-stats/.debug (CONFIG_FREERTOS_RUN_TIME_COUNTER_TYPE_U64): a 32-bit counter wraps after 71 minutes.
    configRUN_TIME_COUNTER_TYPE totalRunTime = 0;
    TaskStatus_t *status = snapshot(reported, totalRunTime);
    if (!status)
    {
        return false;
    }

    // Format every row before the first pause: pcTaskName points into the task's TCB, which a task deleted while
    // the paced lines go out (about half a second) would free. This leaves only a microsecond window.
    char *rows = static_cast<char *>(malloc(reported * ROW_BYTES));
    if (!rows)
    {
        logger.error("debug.stats unavailable: unable to allocate the table");
        free(status);
        return false;
    }
    // The run-time counter ticks once for the whole chip; each core can use all of it.
    const uint64_t cpuTime = static_cast<uint64_t>(totalRunTime) * portNUM_PROCESSORS;
    for (UBaseType_t i = 0; i < reported; i++)
    {
        formatRow(status[i], cpuTime, rows + i * ROW_BYTES);
    }
    free(status);

    // Also before the header: it follows the "Handling command" line back to back and was dropped about a third of the time.
    vTaskDelay(LINE_PAUSE_TICKS);
    logger.infof("=== FreeRTOS run-time stats (%u tasks, total %llu us since boot) ===", (unsigned)reported,
                 (unsigned long long)totalRunTime);
    vTaskDelay(LINE_PAUSE_TICKS);
    char header[ROW_BYTES];
    snprintf(header, sizeof(header), TASK_STATS_HEADER_FORMAT, "Task", "Runtime us", "CPU", "StackHWM", "Core");
    logger.info(header);
    vTaskDelay(LINE_PAUSE_TICKS);
    for (UBaseType_t i = 0; i < reported; i++)
    {
        logger.info(rows + i * ROW_BYTES);
        vTaskDelay(LINE_PAUSE_TICKS);
    }
    logger.info("=== End run-time stats ===");
    free(rows);
    return true;
}

#endif
