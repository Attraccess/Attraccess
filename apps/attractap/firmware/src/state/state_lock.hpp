#pragma once
#include "state.hpp"

struct StateLock
{
    StateLock(SemaphoreHandle_t mutex) : handle(mutex)
    {
        if (handle)
        {
            xSemaphoreTakeRecursive(handle, portMAX_DELAY);
        }
    }

    ~StateLock()
    {
        if (handle)
        {
            xSemaphoreGiveRecursive(handle);
        }
    }

    SemaphoreHandle_t handle;
};
