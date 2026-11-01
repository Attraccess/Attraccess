#include "ui_slot_cache.hpp"

#include <cstring>
#include <new>

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

namespace ui
{
    SlotRecord *allocRecord()
    {
#ifdef ESP_PLATFORM
        // Slot records are large and long-lived: keep them out of the scarce internal RAM.
        void *mem = heap_caps_malloc(sizeof(SlotRecord), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
        if (!mem) mem = heap_caps_malloc(sizeof(SlotRecord), MALLOC_CAP_8BIT);
        return static_cast<SlotRecord *>(mem);
#else
        return new (std::nothrow) SlotRecord;
#endif
    }

    void freeRecord(SlotRecord *rec)
    {
#ifdef ESP_PLATFORM
        heap_caps_free(rec);
#else
        delete rec;
#endif
    }

    SlotCache::~SlotCache() { clear(); }

    static bool sameContribution(const SlotRecord &a, const SlotRecord &b)
    {
        return a.resourceId == b.resourceId && a.slot == b.slot && strcmp(a.key, b.key) == 0;
    }

    int SlotCache::liveNodesLocked() const
    {
        int total = 0;
        for (const Entry &e : entries_)
            if (e.rec && e.rec->slot != SlotId::ListRowStatus) total += e.rec->nodeCount;
        return total;
    }

    ApplyResult SlotCache::apply(const SlotRecord &update, uint32_t nowMillis)
    {
        std::lock_guard<std::mutex> guard(mutex_);
        Entry *existing = nullptr;
        Entry *freeSlot = nullptr;
        for (Entry &e : entries_)
        {
            if (e.rec && sameContribution(*e.rec, update)) existing = &e;
            else if (!e.rec && !freeSlot) freeSlot = &e;
        }
        if (existing && update.revision <= existing->rec->revision) return ApplyResult::Stale;
        if (update.removal)
        {
            if (!existing) return ApplyResult::NoSuchEntry;
            freeRecord(existing->rec);
            existing->rec = nullptr;
            return ApplyResult::Removed;
        }
        const int current = existing && existing->rec->slot != SlotId::ListRowStatus ? existing->rec->nodeCount : 0;
        const int added = update.slot != SlotId::ListRowStatus ? update.nodeCount : 0;
        if (liveNodesLocked() - current + added > MAX_LIVE_NODES) return ApplyResult::LiveNodesExceeded;
        Entry *target = existing ? existing : freeSlot;
        if (!target) return ApplyResult::CapacityFull;
        if (!target->rec)
        {
            target->rec = allocRecord();
            if (!target->rec) return ApplyResult::CapacityFull;
        }
        memcpy(target->rec, &update, sizeof(SlotRecord));
        target->rec->receivedAtMillis = nowMillis;
        return ApplyResult::Applied;
    }

    void SlotCache::clear()
    {
        std::lock_guard<std::mutex> guard(mutex_);
        for (Entry &e : entries_)
        {
            freeRecord(e.rec);
            e.rec = nullptr;
        }
    }

    int64_t SlotCache::remainingMs(const SlotRecord &rec, int64_t toMs, uint32_t nowMillis)
    {
        const int64_t elapsed = static_cast<uint32_t>(nowMillis - rec.receivedAtMillis);
        return (toMs - rec.serverNowMs) - elapsed;
    }

    size_t SlotCache::expire(uint32_t nowMillis)
    {
        std::lock_guard<std::mutex> guard(mutex_);
        size_t dropped = 0;
        for (Entry &e : entries_)
        {
            if (e.rec && e.rec->expiresAtMs != 0 && remainingMs(*e.rec, e.rec->expiresAtMs, nowMillis) <= 0)
            {
                freeRecord(e.rec);
                e.rec = nullptr;
                dropped++;
            }
        }
        return dropped;
    }

    size_t SlotCache::clearSlot(SlotId slot)
    {
        std::lock_guard<std::mutex> guard(mutex_);
        size_t dropped = 0;
        for (Entry &e : entries_)
        {
            if (e.rec && e.rec->slot == slot)
            {
                freeRecord(e.rec);
                e.rec = nullptr;
                dropped++;
            }
        }
        return dropped;
    }

    size_t SlotCache::count() const
    {
        std::lock_guard<std::mutex> guard(mutex_);
        size_t n = 0;
        for (const Entry &e : entries_) n += e.rec != nullptr;
        return n;
    }

    int SlotCache::liveNodes() const
    {
        std::lock_guard<std::mutex> guard(mutex_);
        return liveNodesLocked();
    }

    bool SlotCache::has(uint32_t resourceId, SlotId slot) const
    {
        std::lock_guard<std::mutex> guard(mutex_);
        for (const Entry &e : entries_)
            if (e.rec && e.rec->resourceId == resourceId && e.rec->slot == slot) return true;
        return false;
    }
}
