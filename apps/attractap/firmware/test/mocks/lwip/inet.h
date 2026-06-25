#pragma once
#include <cstdint>

#ifndef IPSTR
#define IPSTR "%d.%d.%d.%d"
typedef struct { uint32_t addr; } esp_ip4_addr_t;
#define IP2STR(a) \
    (int)((a)->addr & 0xFFu), \
    (int)(((a)->addr >> 8) & 0xFFu), \
    (int)(((a)->addr >> 16) & 0xFFu), \
    (int)(((a)->addr >> 24) & 0xFFu)
#endif
