#pragma once

// Advertising data (AD structures) decoding and the scan filter. The API filters again; the reader only keeps
// its results small and relevant.

#include "ble_types.hpp"

namespace ble
{
    // The Bluetooth base UUID with a 16- or 32-bit value in place.
    Uuid uuidFromShort(uint32_t value);

    // Merges one advertising or scan response payload into `into` (UUIDs and manufacturer entries without
    // duplicates, the longest name). Malformed structures end the parse; what was read stays.
    void mergeAdvertisingData(const uint8_t *data, size_t length, Advertisement &into);

    // The API's semantics: every criterion that is set must match (any listed UUID, any listed company id, the
    // name prefix). A filter without any criterion matches nothing.
    bool matchesFilter(const Advertisement &ad, const Command &scan);
    // The same semantics for one filter of the advertisement watch.
    bool matchesFilter(const Advertisement &ad, const WatchFilter &filter);
}
