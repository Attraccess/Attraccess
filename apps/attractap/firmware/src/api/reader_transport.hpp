#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

#ifdef ESP_PLATFORM
#include "esp_websocket_client.h"
#endif

class IReaderTransport
{
public:
    virtual ~IReaderTransport() = default;
    virtual void setup() = 0;
    virtual void loop() = 0;
    virtual bool sendMessage(const char *message, size_t length) = 0;
    virtual bool sendHeartbeat(const char *message, size_t length) = 0;
    virtual void setMessageCallbackRaw(std::function<void(const char *, size_t)> callback) = 0;
    virtual void enableConnectionAttempts() = 0;
    virtual void disableConnectionAttempts() = 0;
    virtual void forceReconnect(const char *reason) = 0;
    // Changes whenever the WebSocket opens or closes: two moments with the same value belong to the same
    // connection. Readable from any task. A transport that cannot lose its connection keeps the default.
    virtual uint32_t connectionId() const { return 0; }
    virtual void resetCertificateTrust() = 0;
#ifdef ESP_PLATFORM
    virtual void setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)> callback) = 0;
#endif

    // --- WebSocket channel used by the secure reader link (src/api/security/reader_link) -------
    // WebSocket subprotocol of the next connection. Takes
    // effect on the next (re)connect, which the transport schedules promptly.
    virtual void setSubprotocol(const std::string &subprotocol) { (void)subprotocol; }
    virtual bool sendBinary(const uint8_t *data, size_t length)
    {
        (void)data;
        (void)length;
        return false;
    }
    // Raw bytes of every binary frame. Return true when consumed; otherwise the binary
    // data callback gets the frame.
    virtual void setRawBinaryCallback(std::function<bool(const uint8_t *, size_t)> callback) { (void)callback; }
    // Called whenever the WebSocket opens (true) or closes (false).
    virtual void setConnectionCallback(std::function<void(bool connected)> callback) { (void)callback; }
    // Whether the send queue still has more than `reserve` free slots. Bulk senders (BLE proxy) keep that
    // much room for heartbeats and UI traffic instead of filling the queue until messages are dropped.
    virtual bool sendQueueHasRoom(size_t reserve) const
    {
        (void)reserve;
        return true;
    }
    // The BLE proxy's reserves: its answers stop with this many slots free, its notifications earlier. On a
    // healthy link a BLE burst fills the queue up to the answer reserve, so the websocket's network quality
    // counts only a deeper backlog as degraded.
    static constexpr size_t BULK_ANSWER_RESERVE = 2;
    static constexpr size_t BULK_NOTIFICATION_RESERVE = 4;
    // Called on the send task whenever a message left the send queue (a slot is free again), so a bulk sender
    // that ran out of room resumes at once instead of polling. Must not block.
    virtual void setSendSlotFreedCallback(std::function<void()> callback) { (void)callback; }

    // --- Reader identity ------------------------------------------------------------------------
    // The transport authenticated the reader itself (paired TLS session).
    virtual bool authenticatesReader() const { return false; }
    // The API sent READER_FIRMWARE_INFO of this sign-in (called right after the send succeeded). The secure
    // reader link sends its eFuse report only then: the server reads the profile from that message.
    virtual void onFirmwareInfoSent() {}
};
