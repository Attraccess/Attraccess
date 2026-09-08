#pragma once

#include <cstddef>
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
};
