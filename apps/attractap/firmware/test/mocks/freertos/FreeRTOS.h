#pragma once
#include <cstdint>

typedef void* SemaphoreHandle_t;
typedef void* QueueHandle_t;
typedef void* TaskHandle_t;
typedef uint32_t TickType_t;

#define portMAX_DELAY ((TickType_t)0xFFFFFFFFu)
#define configTICK_RATE_HZ 1000u
