#pragma once

// The link the reader asks for on every plugin BLE connect (ATT-1296): a short connection interval and the
// largest LE data length, so bulk writes without response and their acks need fewer connection events. No 2M PHY:
// it measured no gain, the round trip is the websocket's. These are requests: a peripheral may refuse or change any
// of them and the session works with whatever it ends up with.
// Plain C++ (no NimBLE), so host tests cover the values and the log line.

#include <cstddef>
#include <cstdint>
#include <cstdio>

namespace ble
{
    namespace link
    {
        // Connection interval in 1.25 ms units: 15 ms (NimBLE's default is 30..50 ms). The controller picks the top
        // of a range, so the range is a single value: 15..30 ms measured 30 ms (16 KiB/s at window 8), 15 ms 18.5.
        constexpr uint16_t INTERVAL_MIN = 12;
        constexpr uint16_t INTERVAL_MAX = 12;
        constexpr uint16_t LATENCY = 0;
        // Supervision timeout in 10 ms units: NimBLE's default 2.56 s, so a lost link is noticed as before.
        constexpr uint16_t SUPERVISION_TIMEOUT = 256;
        // LE Data Length Extension: the largest link-layer payload and its airtime on the 1M PHY.
        constexpr uint16_t DATA_LENGTH_OCTETS = 251;
        constexpr uint16_t DATA_LENGTH_TIME_US = 2120;
        // The LE data length without the extension, and the PHYs (HCI values: 1 = 1M, 2 = 2M, 3 = coded).
        constexpr uint16_t DEFAULT_DATA_LENGTH_OCTETS = 27;
        constexpr uint8_t PHY_1M = 1;

        // The spec's bounds: 7.5 ms..4 s interval, 100 ms..32 s timeout, and the timeout must outlast
        // (1 + latency) * interval * 2 or the link drops between two events.
        constexpr bool valid(uint16_t intervalMin, uint16_t intervalMax, uint16_t latency, uint16_t timeout)
        {
            return intervalMin >= 6 && intervalMin <= intervalMax && intervalMax <= 3200 && latency <= 499 &&
                   timeout >= 10 && timeout <= 3200 &&
                   static_cast<uint32_t>(timeout) * 10 * 4 > (1u + latency) * intervalMax * 5u * 2u;
        }
        static_assert(valid(INTERVAL_MIN, INTERVAL_MAX, LATENCY, SUPERVISION_TIMEOUT), "invalid connection parameters");
    }

    // What the controller negotiated for the current link. Logged on every change (never any payload).
    struct LinkState
    {
        uint16_t interval = 0; // 1.25 ms units
        uint16_t latency = 0;
        uint16_t timeout = 0; // 10 ms units
        uint16_t txOctets = link::DEFAULT_DATA_LENGTH_OCTETS;
        uint16_t rxOctets = link::DEFAULT_DATA_LENGTH_OCTETS;
        uint8_t txPhy = link::PHY_1M;
        uint8_t rxPhy = link::PHY_1M;
    };

    // "interval=15.00ms latency=0 timeout=2560ms data=tx251/rx251 phy=tx1/rx1"
    inline int formatLink(char *out, size_t size, const LinkState &state)
    {
        return std::snprintf(out, size, "interval=%u.%02ums latency=%u timeout=%ums data=tx%u/rx%u phy=tx%u/rx%u",
                             static_cast<unsigned>(state.interval * 5 / 4),
                             static_cast<unsigned>(state.interval * 125 % 100), static_cast<unsigned>(state.latency),
                             static_cast<unsigned>(state.timeout * 10), static_cast<unsigned>(state.txOctets),
                             static_cast<unsigned>(state.rxOctets), static_cast<unsigned>(state.txPhy),
                             static_cast<unsigned>(state.rxPhy));
    }
}
