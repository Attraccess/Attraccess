#pragma once

// Minimal timing shims with Arduino-identical semantics, so the many
// wraparound-safe `millis()` patterns and task-yielding `delay()` call sites
// keep working unchanged on pure ESP-IDF.

#include <cstdint>
#ifdef ATTRACTAP_HOST
#include <atomic>
#include <chrono>
#include <thread>
#else
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#endif

#ifdef ATTRACTAP_HOST
// Simulator tests jump time forward instead of waiting (step watchdog, expiry); hardware never uses this.
inline std::atomic<uint32_t> &hostMillisSkew()
{
    static std::atomic<uint32_t> skew{0};
    return skew;
}
inline void hostAdvanceMillis(uint32_t ms) { hostMillisSkew() += ms; }
// Frozen: millis() (and so LVGL's tick) moves only with hostAdvanceMillis(), and delay() advances it instead of
// sleeping. Lets a simulator test run on a test clock with no real waits.
inline std::atomic<bool> &hostMillisFrozen()
{
    static std::atomic<bool> frozen{false};
    return frozen;
}
#endif

inline uint32_t millis()
{
#ifdef ATTRACTAP_HOST
    static const auto startedAt = std::chrono::steady_clock::now();
    if (hostMillisFrozen()) return hostMillisSkew().load();
    return static_cast<uint32_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - startedAt).count()) + hostMillisSkew().load();
#else
    return (uint32_t)(esp_timer_get_time() / 1000ULL);
#endif
}

#ifdef ATTRACTAP_HOST
// Switches the simulator to the test clock, continuing from the current time.
inline void hostFreezeMillis()
{
    if (hostMillisFrozen()) return;
    hostMillisSkew() = millis();
    hostMillisFrozen() = true;
}
#endif

static inline void delay(uint32_t ms)
{
#ifdef ATTRACTAP_HOST
    if (hostMillisFrozen()) hostAdvanceMillis(ms);
    else std::this_thread::sleep_for(std::chrono::milliseconds(ms));
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
