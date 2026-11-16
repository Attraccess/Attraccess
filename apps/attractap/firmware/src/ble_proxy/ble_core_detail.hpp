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
        inline constexpr size_t MAX_OUTBOX = 32;

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
