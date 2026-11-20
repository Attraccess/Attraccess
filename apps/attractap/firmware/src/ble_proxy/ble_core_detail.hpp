#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdio>

#include "../heap_guard.hpp"
#include "ble_types.hpp"

namespace ble
{
    // Helpers shared by ble_core.cpp and ble_core_events.cpp.
    namespace core_detail
    {
        // Answers and session ends waiting for the websocket. A request is taken only while the outbox has room for
        // its own answer plus everything accepted work may still owe: the queued and the running operation, the
        // open or close answer, the session end, a scan result and the watch's answer and state change.
        inline constexpr size_t OUTBOX_RESERVE = MAX_PENDING_REQUESTS + 6;
        inline constexpr size_t MAX_OUTBOX = 48;
        static_assert(MAX_OUTBOX > OUTBOX_RESERVE + 1, "the outbox must hold more than the reserve");

        // Heap the proxy wants free before it takes work that allocates (heap_guard.hpp keeps its reserve on top).
        // A refused request gets READER_BUSY `memory`, which the API retries like any busy reader.
        inline constexpr size_t SCAN_HEADROOM_BYTES = MAX_SCAN_CANDIDATES * sizeof(Advertisement) + 1024;
        inline constexpr size_t OPEN_HEADROOM_BYTES = 4 * 1024;
        // A read's value, its base64 and the answer around it.
        inline constexpr size_t READ_HEADROOM_BYTES = 2 * 1024;
        // One notification on its way out: the copy of its value, its base64 and the message.
        inline constexpr size_t NOTIFY_HEADROOM_BYTES = 3 * 1024;
        // One queued operation (its value is already allocated).
        inline constexpr size_t QUEUE_HEADROOM_BYTES = 512;
        // What decoding one advertising payload may allocate: a name, UUIDs (16 bytes per 2-byte UUID) and
        // manufacturer data.
        inline size_t advertisementCost(size_t length) { return 8 * length + sizeof(Advertisement); }
        // What one scan result adds to BLE_SCAN_RESULT, three times over: the JSON document, the serialized string
        // and its growth.
        inline size_t scanResultCost(const Advertisement &ad)
        {
            size_t bytes = 96 + ad.name.size() + 40 * ad.serviceUuids.size();
            for (const Advertisement::Manufacturer &m : ad.manufacturers) bytes += 32 + 2 * m.data.size();
            return 3 * bytes;
        }
        inline Error noMemory() { return Error(Code::ReaderBusy, "memory"); }

        inline bool due(uint32_t now, uint32_t deadline) { return static_cast<int32_t>(now - deadline) >= 0; }

        inline const char *opName(CommandType type)
        {
            switch (type)
            {
            case CommandType::Scan: return "scan";
            case CommandType::Open: return "connect";
            case CommandType::Read: return "read";
            case CommandType::Write: return "write";
            case CommandType::Subscribe: return "subscribe";
            case CommandType::Unsubscribe: return "unsubscribe";
            case CommandType::Cancel: return "cancel";
            case CommandType::Close: return "close";
            case CommandType::WatchSet: return "watch";
            default: return "?";
            }
        }

        // Logs carry an 8-character session prefix: enough to follow one session, not a handle to it.
        inline void shortId(const char *id, char out[9])
        {
            std::snprintf(out, 9, "%.8s", id);
        }
    }
}
