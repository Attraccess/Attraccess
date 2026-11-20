#include "ble_watch.hpp"

#include <algorithm>

#include "../heap_guard.hpp"
#include "ble_adv.hpp"
#include "ble_codec.hpp"

namespace ble
{
    namespace
    {
        constexpr uint32_t RATE_WINDOW_MS = 1000;
        static_assert(MAX_WATCH_DEVICES <= 255, "batch indices are bytes");
        static_assert(MAX_WATCH_FILTERS <= 8, "filter masks are bytes");

        bool due(uint32_t now, uint32_t deadline) { return static_cast<int32_t>(now - deadline) >= 0; }

        struct Fnv
        {
            uint32_t value = 2166136261u;
            void add(const uint8_t *data, size_t length)
            {
                for (size_t i = 0; i < length; i++)
                {
                    value ^= data[i];
                    value *= 16777619u;
                }
            }
            void add(uint32_t number)
            {
                const uint8_t bytes[4] = {static_cast<uint8_t>(number), static_cast<uint8_t>(number >> 8),
                                          static_cast<uint8_t>(number >> 16), static_cast<uint8_t>(number >> 24)};
                add(bytes, sizeof bytes);
            }
        };
    }

    uint32_t advertisementHash(const Advertisement &advertisement)
    {
        // Lengths go in too, so moving bytes from one field to the next changes the hash.
        Fnv fnv;
        fnv.add(static_cast<uint32_t>(advertisement.name.size()));
        fnv.add(reinterpret_cast<const uint8_t *>(advertisement.name.data()), advertisement.name.size());
        fnv.add(static_cast<uint32_t>(advertisement.serviceUuids.size()));
        for (const Uuid &uuid : advertisement.serviceUuids) fnv.add(uuid.b, sizeof uuid.b);
        fnv.add(static_cast<uint32_t>(advertisement.manufacturers.size()));
        for (const auto &m : advertisement.manufacturers)
        {
            fnv.add(m.companyId);
            fnv.add(static_cast<uint32_t>(m.data.size()));
            fnv.add(m.data.data(), m.data.size());
        }
        return fnv.value;
    }

    void AdvertisementWatch::set(PsVector<WatchFilter> &&next, uint32_t keepalive, uint32_t now)
    {
        filters = std::move(next);
        keepaliveMs = keepalive;
        devices.clear();
        for (uint32_t &at : sentAt) at = now - RATE_WINDOW_MS;
        oldest = 0;
        hasSentMessage = false;
    }

    void AdvertisementWatch::clear()
    {
        filters.clear();
        devices.clear();
    }

    uint8_t AdvertisementWatch::matchMask(const Advertisement &advertisement) const
    {
        uint8_t mask = 0;
        for (size_t i = 0; i < filters.size(); i++)
            if (matchesFilter(advertisement, filters[i])) mask |= static_cast<uint8_t>(1u << i);
        return mask;
    }

    AdvertisementWatch::Device *AdvertisementWatch::find(const Address &address)
    {
        for (Device &device : devices)
            if (device.advertisement.address == address) return &device;
        return nullptr;
    }

    AdvertisementWatch::Device *AdvertisementWatch::makeRoom()
    {
        // The list grows once, to its bound, and only with the heap to spare; otherwise a device is replaced.
        const bool grow = devices.size() < devices.capacity() ||
                          heap_guard::fits(MAX_WATCH_DEVICES * sizeof(Device));
        if (devices.size() < MAX_WATCH_DEVICES && (grow || devices.empty()))
        {
            if (devices.size() == devices.capacity()) devices.reserve(grow ? MAX_WATCH_DEVICES : 1);
            devices.emplace_back();
            return &devices.back();
        }
        // The device seen longest ago goes, preferably one without an unreported change.
        Device *victim = nullptr;
        for (bool spareChanges : {true, false})
        {
            for (Device &device : devices)
            {
                if (spareChanges && device.pending == Pending::Change) continue;
                if (!victim || static_cast<int32_t>(device.lastSeenMs - victim->lastSeenMs) < 0) victim = &device;
            }
            if (victim) break;
        }
        *victim = Device();
        return victim;
    }

    void AdvertisementWatch::markPending(Device &device, Pending pending, uint32_t now)
    {
        if (pending <= device.pending) return;
        if (device.pending == Pending::None) device.pendingSinceMs = now;
        device.pending = pending;
    }

    void AdvertisementWatch::onAdvertisement(const Address &address, int8_t rssi, bool hasRssi, const uint8_t *data,
                                             size_t length, uint32_t now)
    {
        if (!active()) return;
        Device *device = find(address);
        if (!device)
        {
            Advertisement fresh;
            fresh.address = address;
            mergeAdvertisingData(data, length, fresh);
            const uint8_t mask = matchMask(fresh);
            if (!mask) return;
            device = makeRoom();
            device->advertisement = std::move(fresh);
            device->hash = advertisementHash(device->advertisement);
            device->filterMask = mask;
            markPending(*device, Pending::Change, now);
        }
        else
        {
            // Merged like a scan does, so a device that spreads its data over several reports does not flap.
            mergeAdvertisingData(data, length, device->advertisement);
            const uint8_t mask = matchMask(device->advertisement);
            if (!mask)
            {
                // Its payload no longer matches any filter: forgotten, the API filters again anyway.
                devices.erase(devices.begin() + (device - devices.data()));
                return;
            }
            const uint32_t hash = advertisementHash(device->advertisement);
            if (hash != device->hash || mask != device->filterMask)
                markPending(*device, Pending::Change, now);
            else if (device->sent && due(now, device->lastSentMs + keepaliveMs))
                markPending(*device, Pending::Keepalive, now);
            device->hash = hash;
            device->filterMask = mask;
        }
        if (hasRssi)
        {
            device->advertisement.rssi = rssi;
            device->advertisement.hasRssi = true;
        }
        device->lastSeenMs = now;
    }

    bool AdvertisementWatch::hasPending() const
    {
        for (const Device &device : devices)
            if (device.pending != Pending::None) return true;
        return false;
    }

    size_t AdvertisementWatch::budget(uint32_t now) const
    {
        size_t free = 0;
        while (free < MAX_WATCH_EVENTS_PER_SECOND &&
               due(now, sentAt[(oldest + free) % MAX_WATCH_EVENTS_PER_SECOND] + RATE_WINDOW_MS))
            free++;
        return free;
    }

    std::string AdvertisementWatch::nextMessage(uint32_t now, Batch &batch)
    {
        batch = Batch();
        if (hasSentMessage && !due(now, lastMessageMs + WATCH_BATCH_MS)) return std::string();
        const size_t allowed = std::min<size_t>(MAX_WATCH_EVENTS_PER_MESSAGE, budget(now));
        bool taken[MAX_WATCH_DEVICES] = {};
        // Changes first, then keepalives; the longest waiting first within each.
        for (Pending kind : {Pending::Change, Pending::Keepalive})
        {
            while (batch.count < allowed)
            {
                size_t best = devices.size();
                for (size_t i = 0; i < devices.size(); i++)
                {
                    if (taken[i] || devices[i].pending != kind) continue;
                    if (best == devices.size() ||
                        static_cast<int32_t>(devices[i].pendingSinceMs - devices[best].pendingSinceMs) < 0)
                        best = i;
                }
                if (best == devices.size()) break;
                taken[best] = true;
                batch.devices[batch.count++] = static_cast<uint8_t>(best);
            }
        }
        if (!batch.count) return std::string();
        WatchEvent events[MAX_WATCH_EVENTS_PER_MESSAGE];
        for (uint8_t i = 0; i < batch.count; i++)
        {
            const Device &device = devices[batch.devices[i]];
            WatchEvent &event = events[i];
            event.advertisement = &device.advertisement;
            event.changed = device.pending == Pending::Change;
            for (size_t f = 0; f < filters.size(); f++)
                if (device.filterMask & (1u << f)) event.filters[event.filterCount++] = filters[f].id;
        }
        return watchEventMessage(events, batch.count);
    }

    void AdvertisementWatch::markSent(const Batch &batch, uint32_t now)
    {
        for (uint8_t i = 0; i < batch.count; i++)
        {
            Device &device = devices[batch.devices[i]];
            device.pending = Pending::None;
            device.sent = true;
            device.lastSentMs = now;
        }
        for (uint8_t i = 0; i < batch.count; i++)
        {
            sentAt[oldest] = now;
            oldest = (oldest + 1) % MAX_WATCH_EVENTS_PER_SECOND;
        }
        hasSentMessage = true;
        lastMessageMs = now;
    }

    void AdvertisementWatch::dropKeepalives()
    {
        for (Device &device : devices)
            if (device.pending == Pending::Keepalive) device.pending = Pending::None;
    }
}
