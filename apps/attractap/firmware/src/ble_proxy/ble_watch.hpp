#pragma once

// The advertisement watch's bookkeeping (BLE_WATCH_SET / BLE_WATCH_EVENT): the API's filter set, a bounded table of
// matching devices with their last payload, and what goes out when. Plain C++ like ble_core: the proxy task feeds
// it advertising reports and asks it for the next message; host tests drive it with a fake clock.
//
// Per device the table keeps the merged advertisement (manufacturer data, name, service UUIDs), a hash of it (not of
// the RSSI) and when it was last reported. A device is reported at once when it first matches or its payload
// changed (`changed: true`), and again every `keepaliveMs` while it is still seen (`changed: false`). Messages leave
// at most every WATCH_BATCH_MS with up to MAX_WATCH_EVENTS_PER_MESSAGE events, within MAX_WATCH_EVENTS_PER_SECOND
// per reader; changes go before keepalives.

#include <string>

#include "ble_types.hpp"

namespace ble
{
    class AdvertisementWatch
    {
    public:
        // Which events of the table the next message carries (indices into it).
        struct Batch
        {
            uint8_t devices[MAX_WATCH_EVENTS_PER_MESSAGE] = {};
            uint8_t count = 0;
        };

        // Replaces the whole filter set; the table starts over. An empty set stops the watch.
        void set(PsVector<WatchFilter> &&filters, uint32_t keepaliveMs, uint32_t now);
        void clear();
        bool active() const { return !filters.empty(); }

        // One advertising report (advertising data or scan response).
        void onAdvertisement(const Address &address, int8_t rssi, bool hasRssi, const uint8_t *data, size_t length,
                             uint32_t now);

        bool hasPending() const;
        // The next BLE_WATCH_EVENT, when the batch window and the rate limit let one go now; empty otherwise. Nothing
        // counts as sent until markSent(batch).
        std::string nextMessage(uint32_t now, Batch &batch);
        void markSent(const Batch &batch, uint32_t now);
        // The websocket is backed up: keepalives are dropped (the next report brings them back), changes wait.
        void dropKeepalives();

        size_t deviceCount() const { return devices.size(); }

    private:
        enum class Pending : uint8_t
        {
            None,
            Keepalive,
            Change,
        };

        struct Device
        {
            Advertisement advertisement;
            uint32_t hash = 0;
            uint8_t filterMask = 0; // bit i: filters[i] matches
            uint32_t lastSeenMs = 0;
            uint32_t lastSentMs = 0;
            bool sent = false;
            Pending pending = Pending::None;
            uint32_t pendingSinceMs = 0;
        };

        PsVector<WatchFilter> filters;
        uint32_t keepaliveMs = DEFAULT_WATCH_KEEPALIVE_MS;
        PsVector<Device> devices;
        // When the last MAX_WATCH_EVENTS_PER_SECOND events went out, oldest at `oldest`: an event may go once the
        // one it replaces is a second old, so no second ever carries more.
        uint32_t sentAt[MAX_WATCH_EVENTS_PER_SECOND] = {};
        size_t oldest = 0;
        bool hasSentMessage = false;
        uint32_t lastMessageMs = 0;

        uint8_t matchMask(const Advertisement &advertisement) const;
        Device *find(const Address &address);
        Device *makeRoom();
        size_t budget(uint32_t now) const;
        void markPending(Device &device, Pending pending, uint32_t now);
    };

    // FNV-1a over what the watch compares: manufacturer data, name and service UUIDs (never the RSSI).
    uint32_t advertisementHash(const Advertisement &advertisement);
}
