#pragma once

#include <cstdint>

using TickType_t = uint32_t;
constexpr TickType_t portMAX_DELAY = UINT32_MAX;
constexpr int pdPASS = 1;
constexpr int pdTRUE = 1;
constexpr int pdFALSE = 0;
struct portMUX_TYPE {};
#define portMUX_INITIALIZER_UNLOCKED {}
#define portENTER_CRITICAL(mutex) ((void)(mutex))
#define portEXIT_CRITICAL(mutex) ((void)(mutex))
