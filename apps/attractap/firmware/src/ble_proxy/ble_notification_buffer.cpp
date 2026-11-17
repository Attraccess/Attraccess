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

    bool NotificationBuffer::peek(Entry &out) const
    {
        std::lock_guard<std::mutex> lock(mutex);
        if (entries.empty()) return false;
        out = entries.front();
        return true;
    }

    void NotificationBuffer::removeOldest()
    {
        std::lock_guard<std::mutex> lock(mutex);
        if (entries.empty()) return;
        if (!entries.front().overflow)
        {
            dataEntries--;
            bytes -= entries.front().value.size();
        }
        entries.pop_front();
    }

    void NotificationBuffer::forget(const Uuid &service, const Uuid &characteristic)
    {
        std::lock_guard<std::mutex> lock(mutex);
        const auto matches = [&](const Uuid &s, const Uuid &c) { return s == service && c == characteristic; };
        for (auto it = entries.begin(); it != entries.end();)
        {
            if (!matches(it->service, it->characteristic))
            {
                ++it;
                continue;
            }
            if (!it->overflow)
            {
                dataEntries--;
                bytes -= it->value.size();
            }
            it = entries.erase(it);
        }
        overflowedKeys.erase(std::remove_if(overflowedKeys.begin(), overflowedKeys.end(),
                                            [&](const Key &key) { return matches(key.service, key.characteristic); }),
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
