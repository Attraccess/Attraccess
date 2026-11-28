#pragma once

#include <ArduinoJson.h>

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>

// How the session (ReaderLink) talks to the "Secure this reader" conversion (ATT-1208). Everything runs on the main
// loop. Builds without a conversion client (secure, demo, bridge, host) compile no-ops here, except that a secure app
// reports the outcome of its first-boot migration in `statusMessage()`.
namespace ConversionLink
{
    struct Ports
    {
        // A CONTROL frame in the current session; false when it was not sent (no session, full queue).
        std::function<bool(const std::string &)> sendControl;
        // An application JSON frame (the FIRMWARE_REQUEST_CHUNK event).
        std::function<bool(const std::string &)> sendApp;
        // Ends the connection; the server offers the transfer again in the next session.
        std::function<void(const char *)> reconnect;
    };

    void setPorts(Ports ports);
    void onSessionOpened();
    void onSessionClosed();
    // `conversion.status` for this session (sent before `efuse.report`); empty when the build has nothing to report.
    std::string statusMessage();
    // A `conversion.*` CONTROL message from the server.
    void onControl(const char *type, JsonVariantConst message);
    // A BINARY session frame. True when it was a conversion chunk (the OTA updater must not see it).
    bool onBinary(const uint8_t *data, size_t length);
    void loop();
    // The build advertises `secureConversion` in READER_FIRMWARE_INFO.
    bool advertised();
}
