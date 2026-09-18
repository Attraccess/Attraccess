#pragma once
#include <cstdint>

struct esp_ip4_addr_t { uint32_t addr; };
#define IPSTR "%u.%u.%u.%u"
#define IP2STR(ip) \
    static_cast<unsigned>(reinterpret_cast<const uint8_t *>(&(ip)->addr)[0]), \
    static_cast<unsigned>(reinterpret_cast<const uint8_t *>(&(ip)->addr)[1]), \
    static_cast<unsigned>(reinterpret_cast<const uint8_t *>(&(ip)->addr)[2]), \
    static_cast<unsigned>(reinterpret_cast<const uint8_t *>(&(ip)->addr)[3])
