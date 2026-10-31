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
    virtual void resetCertificateTrust() = 0;
#ifdef ESP_PLATFORM
    virtual void setBinaryDataCallback(std::function<void(esp_websocket_event_data_t)> callback) = 0;
#endif

    // --- WebSocket channel used by the secure reader link (src/api/security/reader_link) -------
    // WebSocket subprotocol of the next connection; empty selects the legacy channel. Takes
    // effect on the next (re)connect, which the transport schedules promptly.
    virtual void setSubprotocol(const std::string &subprotocol) { (void)subprotocol; }
    virtual bool sendBinary(const uint8_t *data, size_t length)
    {
        (void)data;
        (void)length;
        return false;
    }
    // Raw bytes of every binary frame. Return true when consumed; otherwise the legacy binary
    // callback (OTA chunks) gets the frame.
    virtual void setRawBinaryCallback(std::function<bool(const uint8_t *, size_t)> callback) { (void)callback; }
    // Called whenever the WebSocket opens (true) or closes (false).
    virtual void setConnectionCallback(std::function<void(bool connected)> callback) { (void)callback; }

    // --- Reader identity ------------------------------------------------------------------------
    // An admin asked a token-signed-in reader to pair (READER_START_PAIRING), or the reader has no
    // credentials at all (empty ticket): switch to the pairing channel.
    virtual void startPairing(const std::string &ticket) { (void)ticket; }
    // The transport authenticated the reader itself (paired TLS session): no token sign-in.
    virtual bool authenticatesReader() const { return false; }
};
