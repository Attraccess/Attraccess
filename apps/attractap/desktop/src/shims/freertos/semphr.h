#pragma once

#include <mutex>

using SemaphoreHandle_t = std::recursive_mutex *;
inline SemaphoreHandle_t xSemaphoreCreateRecursiveMutex() { return new std::recursive_mutex; }
inline void xSemaphoreTakeRecursive(SemaphoreHandle_t mutex, unsigned int) { mutex->lock(); }
inline void xSemaphoreGiveRecursive(SemaphoreHandle_t mutex) { mutex->unlock(); }
