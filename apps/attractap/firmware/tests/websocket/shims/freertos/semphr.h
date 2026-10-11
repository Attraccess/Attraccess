#pragma once
#include "FreeRTOS.h"
struct TestMutex { bool locked = false; };
using SemaphoreHandle_t = TestMutex *;
int xSemaphoreTake(SemaphoreHandle_t, TickType_t);
int xSemaphoreGive(SemaphoreHandle_t);
