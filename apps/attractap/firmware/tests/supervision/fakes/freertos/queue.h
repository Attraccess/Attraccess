#pragma once

#include "FreeRTOS.h"
#include <cstring>
#include <deque>
#include <vector>

struct SupervisionTestQueue {
    size_t capacity;
    size_t itemSize;
    std::deque<std::vector<uint8_t>> items;
};

using QueueHandle_t = SupervisionTestQueue *;

inline QueueHandle_t xQueueCreate(size_t capacity, size_t itemSize) {
    return new SupervisionTestQueue{capacity, itemSize, {}};
}
inline BaseType_t xQueueSend(QueueHandle_t queue, const void *item, uint32_t) {
    if (queue == nullptr || queue->items.size() == queue->capacity) return pdFAIL;
    std::vector<uint8_t> value(queue->itemSize);
    std::memcpy(value.data(), item, queue->itemSize);
    queue->items.push_back(value);
    return pdPASS;
}
inline BaseType_t xQueueReceive(QueueHandle_t queue, void *item, uint32_t) {
    if (queue == nullptr || queue->items.empty()) return pdFAIL;
    std::memcpy(item, queue->items.front().data(), queue->itemSize);
    queue->items.pop_front();
    return pdPASS;
}
inline void xQueueReset(QueueHandle_t queue) {
    if (queue != nullptr) queue->items.clear();
}
