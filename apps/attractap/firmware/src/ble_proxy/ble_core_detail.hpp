#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdio>

#include "ble_types.hpp"

namespace ble
{
    // Helpers shared by ble_core.cpp and ble_core_events.cpp.
    namespace core_detail
    {
        // Answers and session ends waiting for the websocket. A request is taken only while the outbox has room for
        // its own answer plus everything accepted work may still owe: the queued and the running operation, the
        // open or close answer, the session end and a scan result.
        inline constexpr size_t OUTBOX_RESERVE = MAX_PENDING_REQUESTS + 4;
        inline constexpr size_t MAX_OUTBOX = 48;
        static_assert(MAX_OUTBOX > OUTBOX_RESERVE + 1, "the outbox must hold more than the reserve");

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
