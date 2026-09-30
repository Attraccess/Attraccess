#pragma once

#include "FreeRTOS.h"

#include <cstring>
#include <vector>

struct HostQueue { size_t itemSize; std::vector<unsigned char> item; bool ready = false; };
using QueueHandle_t = HostQueue *;
inline QueueHandle_t xQueueCreate(unsigned, size_t itemSize) { return new HostQueue{itemSize}; }
inline int xQueueSend(QueueHandle_t queue, const void *value, TickType_t)
{
    if (!queue || queue->ready) return 0;
    queue->item.assign(static_cast<const unsigned char *>(value), static_cast<const unsigned char *>(value) + queue->itemSize);
    queue->ready = true;
    return pdPASS;
}
inline int xQueueReceive(QueueHandle_t queue, void *value, TickType_t)
{
    if (!queue || !queue->ready) return 0;
    std::memcpy(value, queue->item.data(), queue->itemSize);
    queue->ready = false;
    return pdPASS;
}
inline void xQueueReset(QueueHandle_t queue) { if (queue) queue->ready = false; }
