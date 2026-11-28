// heap_guard::reserveFor (ATT-1394): a vector grows only after a check of the size the growth really allocates.
// `insert` grows to about double the current size, so a check of `size + length` alone passed on the BLE bridge and
// the allocation still failed (exceptions are off: the reader aborted).
#include "heap_guard.hpp"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <vector>

namespace
{
    int failures = 0;

    void expect(bool condition, const char *what)
    {
        if (condition) return;
        std::fprintf(stderr, "FAIL: %s\n", what);
        failures++;
    }

    using Budget = heap_guard::TestBudget;

    constexpr size_t RESERVE = heap_guard::CRITICAL_RESERVE_BYTES;
    constexpr size_t CAPACITY = 1000;
    constexpr size_t SIZE = 900;
    constexpr size_t NEEDED = SIZE + 200;

    // A vector with capacity CAPACITY and SIZE numbered bytes.
    std::vector<uint8_t> filled()
    {
        std::vector<uint8_t> v;
        v.reserve(CAPACITY);
        for (size_t i = 0; i < SIZE; i++) v.push_back(static_cast<uint8_t>(i));
        return v;
    }

    bool intact(const std::vector<uint8_t> &v)
    {
        if (v.size() != SIZE) return false;
        for (size_t i = 0; i < SIZE; i++)
            if (v[i] != static_cast<uint8_t>(i)) return false;
        return true;
    }

    void roomForNeededButNotDoubleReservesExactlyNeeded()
    {
        auto v = filled();
        Budget budget(RESERVE + NEEDED); // 2 * SIZE does not fit
        expect(heap_guard::reserveFor(v, NEEDED, RESERVE), "needed fits: true");
        expect(v.capacity() == NEEDED, "exactly needed is reserved, not the doubling");
        expect(intact(v), "the contents stay");
    }

    void roomForDoubleDoubles()
    {
        auto v = filled();
        Budget budget(RESERVE + 2 * SIZE);
        expect(heap_guard::reserveFor(v, NEEDED, RESERVE), "double fits: true");
        expect(v.capacity() == 2 * SIZE, "doubles the size, as insert would, so later appends do not reallocate");
        expect(intact(v), "the contents stay");

        auto capped = filled();
        budget.set(SIZE_MAX);
        expect(heap_guard::reserveFor(capped, NEEDED, RESERVE, 1500), "with a limit: true");
        expect(capped.capacity() == 1500, "the doubling stops at the limit");

        auto below = filled();
        expect(heap_guard::reserveFor(below, NEEDED, RESERVE, SIZE), "a limit below needed: true");
        expect(below.capacity() == NEEDED, "needed wins over the limit");
    }

    // SessionTls: inbound is empty when a feed starts and keeps only its buffer. `insert` would take exactly
    // `needed` (libstdc++ doubles the size, which is 0), so reserveFor takes no more, even with heap to spare.
    void anEmptyVectorTakesExactlyNeeded()
    {
        std::vector<uint8_t> v;
        v.reserve(CAPACITY);
        Budget budget(SIZE_MAX);
        expect(heap_guard::reserveFor(v, CAPACITY + 1, RESERVE), "empty, kept buffer: true");
        expect(v.capacity() == CAPACITY + 1, "exactly needed, not double the kept capacity");
    }

    void noRoomLeavesTheVectorAlone()
    {
        auto v = filled();
        Budget budget(RESERVE + NEEDED - 1);
        expect(!heap_guard::reserveFor(v, NEEDED, RESERVE), "below needed: false");
        expect(v.capacity() == CAPACITY && intact(v), "size, capacity and contents unchanged");

        budget.set(RESERVE - 1);
        expect(!heap_guard::reserveFor(v, NEEDED, RESERVE), "below the reserve: false");
        expect(v.capacity() == CAPACITY && intact(v), "still unchanged");
    }

    void spareCapacityNeedsNoHeap()
    {
        auto v = filled();
        Budget budget(0);
        expect(heap_guard::reserveFor(v, CAPACITY, RESERVE), "needed within capacity: true without heap");
        expect(v.capacity() == CAPACITY && intact(v), "nothing allocated");
    }

    void elementSizeCountsAndOverflowIsRefused()
    {
        std::vector<uint32_t> words;
        words.reserve(100);
        words.resize(100, 7);
        Budget budget(RESERVE + 150 * sizeof(uint32_t)); // 150 words fit, the doubling to 200 does not
        expect(heap_guard::reserveFor(words, 150, RESERVE), "150 words fit");
        expect(words.capacity() == 150, "bytes are counted per element");
        budget.set(RESERVE + 151 * sizeof(uint32_t) - 1);
        expect(!heap_guard::reserveFor(words, 151, RESERVE), "151 words do not");

        // A count beyond what a vector can hold never reaches reserve() (it would abort), even with no budget limit.
        budget.set(SIZE_MAX);
        expect(!heap_guard::reserveFor(words, SIZE_MAX, 0), "SIZE_MAX elements: false");
        expect(!heap_guard::reserveFor(words, SIZE_MAX / 2, 0), "past max_size: false");
        expect(words.capacity() == 150 && words.size() == 100, "unchanged");
    }
}

int main()
{
    roomForNeededButNotDoubleReservesExactlyNeeded();
    roomForDoubleDoubles();
    anEmptyVectorTakesExactlyNeeded();
    noRoomLeavesTheVectorAlone();
    spareCapacityNeedsNoHeap();
    elementSizeCountsAndOverflowIsRefused();
    if (failures)
    {
        std::fprintf(stderr, "%d heap guard checks failed\n", failures);
        return EXIT_FAILURE;
    }
    std::puts("heap guard tests passed");
    return EXIT_SUCCESS;
}
