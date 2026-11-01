#pragma once
#include <cstdint>
using TickType_t = uint32_t;
#define pdMS_TO_TICKS(ms) (ms)
struct portMUX_TYPE {};
#define portMUX_INITIALIZER_UNLOCKED {}
#define portENTER_CRITICAL(mux) ((void)(mux))
#define portEXIT_CRITICAL(mux) ((void)(mux))
