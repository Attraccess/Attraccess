#pragma once

// `capabilities.ble` of READER_FIRMWARE_INFO: protocol v1 and the reader's real bounds. A reader without it
// (older firmware, demo variants, the desktop simulator) gets READER_UNSUPPORTED from the API.

#include <ArduinoJson.h>
#include <stdio.h>

#include "ble_types.hpp"

namespace ble
{
    // Rendered as text and spliced in raw like `capabilities.ui` (smaller than ArduinoJson's per-field code).
    constexpr size_t CAPABILITY_SCRATCH = 360;

    inline void fillCapability(JsonObject caps, char *scratch, size_t n)
    {
        snprintf(scratch, n,
                 "{\"version\":%d,\"operations\":[\"scan\",\"connect\",\"read\",\"write\",\"writeWithoutResponse\","
                 "\"subscribe\",\"unsubscribe\",\"cancel\"],\"maxConnections\":1,\"maxMtu\":%u,\"maxPayloadBytes\":%u,"
                 "\"maxNotificationQueue\":%u,\"maxNotificationQueueBytes\":%u,\"maxScanMs\":%u,\"maxScanResults\":%u,"
                 "\"maxAllowlistEntries\":%u,\"maxPendingRequests\":%u}",
                 PROTOCOL_VERSION, static_cast<unsigned>(MAX_MTU), static_cast<unsigned>(MAX_PAYLOAD_BYTES),
                 static_cast<unsigned>(MAX_NOTIFICATION_QUEUE), static_cast<unsigned>(MAX_NOTIFICATION_QUEUE_BYTES),
                 static_cast<unsigned>(MAX_SCAN_MS), static_cast<unsigned>(MAX_SCAN_RESULTS),
                 static_cast<unsigned>(MAX_ALLOWLIST_ENTRIES), static_cast<unsigned>(MAX_PENDING_REQUESTS));
        caps["ble"] = serialized(scratch);
    }
}
