#pragma once
#include "FreeRTOS.h"

#define pdMS_TO_TICKS(ms) ((TickType_t)(ms))

inline void vTaskDelay(TickType_t) {}
inline void vTaskDelete(TaskHandle_t) {}
