#pragma once
#include "../display-theme/lv_conf.h"
// Exercise the production TLSF pool; replace only ESP-IDF's heap provider.
#undef LV_USE_STDLIB_MALLOC
#define LV_USE_STDLIB_MALLOC LV_STDLIB_BUILTIN
