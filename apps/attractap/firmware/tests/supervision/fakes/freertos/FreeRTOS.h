#pragma once

#include <cstdint>

using BaseType_t = int;
using portMUX_TYPE = int;

constexpr BaseType_t pdPASS = 1;
constexpr BaseType_t pdFAIL = 0;
#define portMUX_INITIALIZER_UNLOCKED 0
#define portENTER_CRITICAL(mux) ((void)(mux))
#define portEXIT_CRITICAL(mux) ((void)(mux))
