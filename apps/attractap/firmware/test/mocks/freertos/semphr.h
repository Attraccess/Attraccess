#pragma once
#include "FreeRTOS.h"

#define xSemaphoreCreateMutex() (nullptr)
#define xSemaphoreTake(s, t) (1)
#define xSemaphoreGive(s) (1)
