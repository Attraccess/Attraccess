#pragma once

#include "FreeRTOS.h"

inline void vTaskDelay(TickType_t) {}
#define pdMS_TO_TICKS(value) (value)
#define portTICK_PERIOD_MS 1
