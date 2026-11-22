#pragma once

// TLS records of the secure session on their way to the websocket (ATT-1315). A record that TLS produced has used
// its sequence number: losing it breaks the stream for good, so the reader had to reconnect whenever the websocket
// refused one (its send queue full, or no heap for the copy). Under a long BLE transfer on the BLE bridge that
// turned every few seconds of TCP back-pressure into a dropped connection.
//
// The outbox keeps refused records, in order, and hands them over again on the next try. Senders ask `accepting()`
// before they encrypt anything new, so a backlog never grows behind a stalled websocket: a new message is refused
// (not encrypted, nothing lost) until the backlog is out. The stream is given up only when the backlog grows past
// MAX_BYTES or the websocket takes nothing for MAX_STALL_MS: then the connection is gone anyway.
//
// Plain C++: host tests drive it with a fake clock and a fake websocket.

#include <cstddef>
#include <cstdint>
#include <vector>

#include "../../heap_guard.hpp"

class SessionOutbox
{
public:
    // Records in flight at once: a handshake flight, or a few messages TLS split into records.
    static constexpr size_t MAX_BYTES = 16 * 1024;
    // The websocket's own liveness limit: a backlog older than this belongs to a connection that is gone.
    static constexpr uint32_t MAX_STALL_MS = 20000;

    enum class Result : uint8_t
    {
        Sent,    // nothing waits any more
        Pending, // the websocket refused the records; they wait, in order, for the next flush
        Broken,  // the backlog grew too large or too old: the stream cannot go on
    };

    // A record from TLS. False when it does not fit (MAX_BYTES, or the heap): TLS fails the session instead of the
    // reader aborting on a failed allocation.
    bool append(const uint8_t *data, size_t length)
    {
        if (records.size() + length > MAX_BYTES) return false;
        if (records.capacity() - records.size() < length &&
            !heap_guard::fits(records.size() + length, heap_guard::CRITICAL_RESERVE_BYTES))
            return false;
        records.insert(records.end(), data, data + length);
        return true;
    }

    bool empty() const { return records.empty(); }
    size_t size() const { return records.size(); }

    // Whether a sender may encrypt a new message now: nothing refused is still waiting.
    bool accepting() const { return !refused; }

    // Hands every waiting record to `send(data, length)` as one websocket frame, in order.
    template <typename Send> Result flush(uint32_t nowMs, Send &&send)
    {
        if (records.empty())
        {
            refused = false;
            return Result::Sent;
        }
        if (send(records.data(), records.size()))
        {
            records.clear();
            // A large handshake flight or backlog must not keep its buffer for the whole connection.
            if (records.capacity() > KEEP_CAPACITY) records.shrink_to_fit();
            refused = false;
            return Result::Sent;
        }
        if (!refused)
        {
            refused = true;
            refusedSinceMs = nowMs;
        }
        if (records.size() > MAX_BYTES || static_cast<int32_t>(nowMs - refusedSinceMs) >= static_cast<int32_t>(MAX_STALL_MS))
            return Result::Broken;
        return Result::Pending;
    }

    // The session ended: its records mean nothing to the next one.
    void clear()
    {
        records.clear();
        records.shrink_to_fit();
        refused = false;
    }

private:
    static constexpr size_t KEEP_CAPACITY = 2048;

    std::vector<uint8_t> records;
    bool refused = false;
    uint32_t refusedSinceMs = 0;
};
