#pragma once

// Minimal timing shims with Arduino-identical semantics, so the many
// wraparound-safe `millis()` patterns and task-yielding `delay()` call sites
// keep working unchanged on pure ESP-IDF.

#include <cstdint>
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static inline uint32_t millis()
{
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
}

static inline void delay(uint32_t ms)
{
    vTaskDelay(pdMS_TO_TICKS(ms));
}

static inline void delayMicroseconds(uint32_t us)
{
    esp_rom_delay_us(us);
}
