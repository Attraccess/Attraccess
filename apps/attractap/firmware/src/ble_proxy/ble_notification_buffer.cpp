#include "ble_notification_buffer.hpp"

#include <algorithm>

namespace ble
{
    bool NotificationBuffer::overflowed(const Uuid &service, const Uuid &characteristic) const
    {
        return std::any_of(overflowedKeys.begin(), overflowedKeys.end(), [&](const Key &key) {
            return key.service == service && key.characteristic == characteristic;
        });
    }

    bool NotificationBuffer::push(const Uuid &service, const Uuid &characteristic, const uint8_t *data, size_t length)
    {
        std::lock_guard<std::mutex> lock(mutex);
        if (overflowed(service, characteristic)) return false;
        const bool oversized = length > MAX_PAYLOAD_BYTES;
        const size_t cost = oversized ? 0 : length;
        if (dataEntries >= maxEntries || bytes + cost > maxBytes)
        {
            // One marker per characteristic; at most one per allowlist entry, so markers stay bounded too.
            if (overflowedKeys.size() >= MAX_ALLOWLIST_ENTRIES) return false;
            overflowedKeys.push_back({service, characteristic});
            Entry marker;
            marker.service = service;
            marker.characteristic = characteristic;
            marker.overflow = true;
            entries.push_back(std::move(marker));
            return false;
        }
        Entry entry;
        entry.service = service;
        entry.characteristic = characteristic;
        if (oversized) entry.oversizedLength = length;
        else entry.value.assign(data, data + length);
        entries.push_back(std::move(entry));
        dataEntries++;
        bytes += cost;
        return true;
    }

    bool NotificationBuffer::pop(Entry &out)
    {
        std::lock_guard<std::mutex> lock(mutex);
        if (entries.empty()) return false;
        out = std::move(entries.front());
        entries.pop_front();
        if (!out.overflow)
        {
            dataEntries--;
            bytes -= out.value.size();
        }
        return true;
    }

    void NotificationBuffer::rearm(const Uuid &service, const Uuid &characteristic)
    {
        std::lock_guard<std::mutex> lock(mutex);
        overflowedKeys.erase(std::remove_if(overflowedKeys.begin(), overflowedKeys.end(),
                                            [&](const Key &key) {
                                                return key.service == service && key.characteristic == characteristic;
                                            }),
                             overflowedKeys.end());
    }

    void NotificationBuffer::clear()
    {
        std::lock_guard<std::mutex> lock(mutex);
        entries.clear();
        overflowedKeys.clear();
        dataEntries = 0;
        bytes = 0;
    }

    size_t NotificationBuffer::size() const
    {
        std::lock_guard<std::mutex> lock(mutex);
        return entries.size();
    }
}
