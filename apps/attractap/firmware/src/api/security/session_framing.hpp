#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <vector>

// Message framing inside the TLS byte stream: [type:u8][length:u32 BE][payload], as in
// apps/api/src/attractap/security/session-framing.ts.
namespace SessionFraming
{
    constexpr const char *SESSION_SUBPROTOCOL = "attractap-session.v1";
    constexpr const char *PAIRING_SUBPROTOCOL = "attractap-pairing.v1";
    constexpr size_t MAX_MESSAGE_BYTES = 64 * 1024;
    constexpr size_t HEADER_BYTES = 5;

    enum class FrameType : uint8_t
    {
        JSON = 1,      // UTF-8 JSON application event
        BINARY = 2,    // application binary data (OTA chunks)
        HEARTBEAT = 3, // reader keep-alive, empty payload
        CONTROL = 4,   // session-layer control message (JSON)
    };

    bool encode(FrameType type, const uint8_t *payload, size_t length, std::vector<uint8_t> &out);

    // Incremental decoder. push() returns false on a protocol violation (unknown type, oversized
    // message); the session must then be closed.
    class Decoder
    {
    public:
        using FrameCallback = std::function<void(FrameType type, const uint8_t *payload, size_t length)>;
        bool push(const uint8_t *data, size_t length, const FrameCallback &onFrame);
        void reset() { buffered.clear(); }

    private:
        std::vector<uint8_t> buffered;
    };
}
