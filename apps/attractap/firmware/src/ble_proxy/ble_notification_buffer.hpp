#pragma once

// The session's notification buffer, bounded by count and bytes. NimBLE's host task pushes, the proxy task
// pops and forwards as fast as the websocket takes them. When it is full the characteristic gets one overflow
// marker (delivered after what was buffered before it) and nothing more until it is subscribed again: the
// API fails that stream with NOTIFICATION_OVERFLOW instead of seeing a silent gap.

#include <deque>
#include <mutex>

#include "ble_types.hpp"

namespace ble
{
    class NotificationBuffer
    {
    public:
        struct Entry
        {
            Uuid service;
            Uuid characteristic;
            Bytes value;
            // The peripheral sent more than the protocol allows; only the length is kept.
            size_t oversizedLength = 0;
            bool overflow = false;
        };

        explicit NotificationBuffer(size_t maxEntries = MAX_NOTIFICATION_QUEUE,
                                    size_t maxBytes = MAX_NOTIFICATION_QUEUE_BYTES)
            : maxEntries(maxEntries), maxBytes(maxBytes) {}

        // false: dropped (buffer full, or the characteristic already overflowed).
        bool push(const Uuid &service, const Uuid &characteristic, const uint8_t *data, size_t length);
        bool pop(Entry &out);
        // A new subscription to the characteristic: it may deliver again.
        void rearm(const Uuid &service, const Uuid &characteristic);
        void clear();
        size_t size() const;

    private:
        struct Key
        {
            Uuid service;
            Uuid characteristic;
        };
        bool overflowed(const Uuid &service, const Uuid &characteristic) const;

        const size_t maxEntries;
        const size_t maxBytes;
        mutable std::mutex mutex;
        std::deque<Entry, PsAlloc<Entry>> entries;
        PsVector<Key> overflowedKeys;
        size_t dataEntries = 0;
        size_t bytes = 0;
    };
}
