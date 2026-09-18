#pragma once

// Minimal timing shims with Arduino-identical semantics, so the many
// wraparound-safe `millis()` patterns and task-yielding `delay()` call sites
// keep working unchanged on pure ESP-IDF.

#include <cstdint>
#ifdef ATTRACTAP_HOST
#include <chrono>
#include <thread>
#else
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

inline uint32_t millis()
{
#ifdef ATTRACTAP_HOST
    static const auto startedAt = std::chrono::steady_clock::now();
    return static_cast<uint32_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - startedAt).count());
#else
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
#endif
}

static inline void delay(uint32_t ms)
{
#ifdef ATTRACTAP_HOST
    std::this_thread::sleep_for(std::chrono::milliseconds(ms));
#else
    vTaskDelay(pdMS_TO_TICKS(ms));
#endif
}

static inline void delayMicroseconds(uint32_t us)
{
#ifdef ATTRACTAP_HOST
    std::this_thread::sleep_for(std::chrono::microseconds(us));
#else
    esp_rom_delay_us(us);
#endif
}
