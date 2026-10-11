#pragma once
#include <stddef.h>
#include <stdint.h>
#define MALLOC_CAP_SPIRAM (1U << 10)
#define MALLOC_CAP_8BIT (1U << 2)
void *heap_caps_malloc(size_t size, uint32_t capabilities);
