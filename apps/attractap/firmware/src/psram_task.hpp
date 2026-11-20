#pragma once

// Tasks whose stack lives in PSRAM, so it costs no internal RAM.
//
// Such a task may read and write NVS only because the firmware runs from PSRAM
// (CONFIG_SPIRAM_XIP_FROM_PSRAM): without it a flash access disables the cache, and spi_flash
// asserts on a task stack outside internal RAM. Even with it, the task must never map flash (OTA,
// esp_partition_mmap, reads of an encrypted partition): ESP-IDF asserts on a PSRAM stack while it
// remaps.

#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include "freertos/task.h"
#include "sdkconfig.h"

#if !(CONFIG_SPIRAM_FETCH_INSTRUCTIONS && CONFIG_SPIRAM_RODATA)
#error "PSRAM task stacks need CONFIG_SPIRAM_XIP_FROM_PSRAM"
#endif

// For tasks that never end: one that returns must delete itself with vTaskDeleteWithCaps().
inline bool createPsramTask(TaskFunction_t entry, const char *name, uint32_t stackBytes, void *argument,
                            UBaseType_t priority, TaskHandle_t *handle = nullptr)
{
    return xTaskCreatePinnedToCoreWithCaps(entry, name, stackBytes, argument, priority, handle, tskNO_AFFINITY,
                                           MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT) == pdPASS;
}
