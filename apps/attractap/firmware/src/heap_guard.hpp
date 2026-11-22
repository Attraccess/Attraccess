#pragma once

// Heap headroom checks before a large or unbounded allocation (ATT-1315). The firmware builds without C++
// exceptions, so a failed `new` or container growth aborts and reboots the reader. Code that grows on behalf of
// the network (BLE values, scan results, received TLS bytes) asks first and refuses the work with a retryable
// error instead. On the BLE bridge (no PSRAM) every byte comes from internal RAM, which Wi-Fi, both TLS layers
// and NimBLE share.
//
// Plain C++: host tests set the budget with heap_guard::setTestBudget().

#include <cstddef>
#include <cstdint>

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

namespace heap_guard
{
    // What bulk work leaves free for the rest of the reader: a TLS record of the secure session, the websocket's
    // own TLS record and Wi-Fi/lwIP buffers. Bulk BLE work stops short of it.
    constexpr size_t BULK_RESERVE_BYTES = 8 * 1024;
    // What work that keeps the connection alive (received TLS bytes) leaves free.
    constexpr size_t CRITICAL_RESERVE_BYTES = 2 * 1024;

#ifndef ESP_PLATFORM
    inline size_t &testBudget()
    {
        static size_t budget = SIZE_MAX;
        return budget;
    }
    // Host tests: the largest block an allocation may take. SIZE_MAX (the default) means unlimited.
    inline void setTestBudget(size_t bytes) { testBudget() = bytes; }
#endif

    // The largest single allocation that can succeed right now (8-bit capable heap: internal RAM, plus PSRAM
    // where the board has it).
    inline size_t largestBlock()
    {
#ifdef ESP_PLATFORM
        return heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
#else
        return testBudget();
#endif
    }

    // Free bytes in total. Cheap (no heap walk), unlike largestBlock(), which walks every block with interrupts
    // masked: on readers with PSRAM that is thousands of blocks, on the hot paths (every advertisement report).
    inline size_t freeBytes()
    {
#ifdef ESP_PLATFORM
        return heap_caps_get_free_size(MALLOC_CAP_8BIT);
#else
        return testBudget();
#endif
    }

    // Free memory above which a request is granted without walking the heap: fragmentation never splits it so
    // finely that no block of the (at most a few KB) requests fits.
    constexpr size_t PLENTY_FREE_BYTES = 128 * 1024;

    // Whether `bytes` can be allocated in one block and still leave `reserve` bytes for the rest of the reader.
    inline bool fits(size_t bytes, size_t reserve = BULK_RESERVE_BYTES)
    {
        const size_t free = freeBytes();
        if (free < reserve || free - reserve < bytes) return false;
        if (free - reserve - bytes >= PLENTY_FREE_BYTES) return true;
        const size_t largest = largestBlock();
        return largest >= reserve && largest - reserve >= bytes;
    }
}
