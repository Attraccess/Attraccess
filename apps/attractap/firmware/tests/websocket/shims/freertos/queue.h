#pragma once
#include "FreeRTOS.h"
using QueueHandle_t = void *;
UBaseType_t uxQueueMessagesWaiting(QueueHandle_t);
