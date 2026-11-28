#pragma once

// Heap headroom checks before a large or unbounded allocation (ATT-1315). The firmware builds without C++
// exceptions, so a failed `new` or container growth aborts and reboots the reader. Code that grows on behalf of
// the network (BLE values, scan results, received TLS bytes) asks first and refuses the work with a retryable
// error instead. On the BLE bridge (no PSRAM) every byte comes from internal RAM, which Wi-Fi, both TLS layers
// and NimBLE share.
//
// Plain C++: host tests set the budget with heap_guard::setTestBudget().

#include <algorithm>
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

    // Host tests: the budget for a scope, unlimited again after it (also when a check in between fails).
    struct TestBudget
    {
        explicit TestBudget(size_t bytes) { setTestBudget(bytes); }
        ~TestBudget() { setTestBudget(SIZE_MAX); }
        TestBudget(const TestBudget &) = delete;
        TestBudget &operator=(const TestBudget &) = delete;
        void set(size_t bytes) { setTestBudget(bytes); }
    };
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

    // Grows `v` so it takes `needed` elements without reallocating again (ATT-1394). A plain `insert` grows to about
    // double the current size (libstdc++: size + max(size, n)), not to `needed`, so a check of `needed` bytes alone
    // passes and the allocation still fails; with exceptions off that aborts the reader. Tries that doubling (capped
    // at `limit`) first, then exactly `needed`. It doubles the size, not the capacity, so an empty vector that kept
    // its buffer takes exactly `needed`, as `insert` would. False, with `v` unchanged, when neither fits with
    // `reserve` left over. The old buffer is still allocated while `fits` measures: during the copy both exist.
    template <typename V>
    bool reserveFor(V &v, size_t needed, size_t reserve = BULK_RESERVE_BYTES, size_t limit = SIZE_MAX)
    {
        if (needed <= v.capacity()) return true;
        if (needed > v.max_size()) return false;
        constexpr size_t elem = sizeof(typename V::value_type);
        // Unreachable past the max_size() check today; kept so the arithmetic stays safe on its own.
        const auto bytesOf = [](size_t count) { return count > SIZE_MAX / elem ? SIZE_MAX : count * elem; };
        const size_t size = v.size();
        const size_t doubled = size > SIZE_MAX / 2 ? SIZE_MAX : size * 2;
        const size_t grown = std::min(std::max(needed, std::min(doubled, limit)), v.max_size());
        if (grown > needed && fits(bytesOf(grown), reserve))
        {
            v.reserve(grown);
            return true;
        }
        if (fits(bytesOf(needed), reserve))
        {
            v.reserve(needed);
            return true;
        }
        return false;
    }
}
