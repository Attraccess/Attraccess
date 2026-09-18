#pragma once

#include <cstdint>

typedef struct { uint32_t addr; } esp_ip4_addr_t;

#define IPSTR "%u.%u.%u.%u"
#define IP2STR(ip) ((ip)->addr & 0xff), (((ip)->addr >> 8) & 0xff), (((ip)->addr >> 16) & 0xff), (((ip)->addr >> 24) & 0xff)
