#pragma once
#include <cstdint>
using TickType_t = uint32_t;
using UBaseType_t = unsigned;
#define pdMS_TO_TICKS(ms) (ms)
#define portMAX_DELAY UINT32_MAX
