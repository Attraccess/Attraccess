#pragma once

// Board configuration header
// This file includes the appropriate pin definitions based on build flags

#if defined(CONFIG_ATTRACTAP)
#include "configs/attractap.h"
// Additional board configurations can be added here
#else
#error "No board configuration selected"
#endif
