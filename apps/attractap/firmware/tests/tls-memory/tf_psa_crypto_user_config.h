// As on the device (ESP-IDF's esp_config.h): mbedtls_platform_set_calloc_free() exists, so the test can install
// its recording allocator.
#pragma once

#define MBEDTLS_PLATFORM_MEMORY
