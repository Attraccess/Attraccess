#pragma once

// Cache of the plugin slot contributions a reader currently shows. Written by the task that dispatches
// inbound messages, read by LvglTask when it (re)builds screens. Lock order: LVGL lock first, then this
// cache's mutex; writers must release the mutex before they touch LVGL.

#include <mutex>

#include "ui_record.hpp"

namespace ui
{
    enum class ApplyResult : uint8_t { Applied, Removed, Stale, CapacityFull, LiveNodesExceeded, NoSuchEntry };

    class SlotCache
    {
    public:
        static constexpr size_t MAX_ENTRIES = 24;

        SlotCache() = default;
        SlotCache(const SlotCache &) = delete;
        SlotCache &operator=(const SlotCache &) = delete;
        ~SlotCache();

        // Applies a parsed update. Revisions at or below the stored one are stale (still acked by the caller).
        // `nowMillis` becomes the record's receive time for countdown maths.
        ApplyResult apply(const SlotRecord &update, uint32_t nowMillis);
        // Drops everything (disconnect, reconnect, signed out). Revisions restart afterwards.
        void clear();
        // Removes entries whose expiresAtMs has passed. Returns how many were dropped.
        size_t expire(uint32_t nowMillis);
        // Drops all entries of one slot kind (e.g. user-scoped session slots on sign-out).
        size_t clearSlot(SlotId slot);

        // Visits live entries of a resource+slot in insertion (host) order; callback runs under the mutex.
        template <typename Fn>
        void forEach(uint32_t resourceId, SlotId slot, Fn &&fn) const
        {
            std::lock_guard<std::mutex> guard(mutex_);
            for (const Entry &e : entries_)
                if (e.rec && e.rec->resourceId == resourceId && e.rec->slot == slot) fn(*e.rec);
        }

        size_t count() const;
        // Nodes of all details slots (list-row badges count against the pool reserve instead).
        int liveNodes() const;
        bool has(uint32_t resourceId, SlotId slot) const;
        // Change counter: every applied update gets a new SlotRecord::stamp; removals bump it too.
        uint32_t stamp() const;
        // True when the details slots of `resourceId` may differ from what the cache held at `since` (any details
        // removal counts, list-row changes do not).
        bool detailsChangedSince(uint32_t resourceId, uint32_t since) const;

        // Remaining milliseconds until `toMs` (server clock), using millis() deltas only.
        static int64_t remainingMs(const SlotRecord &rec, int64_t toMs, uint32_t nowMillis);

    private:
        struct Entry { SlotRecord *rec = nullptr; };
        int liveNodesLocked() const;
        void dropLocked(Entry &e);
        Entry entries_[MAX_ENTRIES];
        uint32_t stamp_ = 0;
        uint32_t detailsRemovedStamp_ = 0;
        mutable std::mutex mutex_;
    };

    // m:ss, or h:mm:ss from 60 minutes up; negative values clamp to 0:00.
    int formatCountdown(int64_t remainingMs, char *out, size_t cap);

    SlotRecord *allocRecord();
    void freeRecord(SlotRecord *rec);
}
