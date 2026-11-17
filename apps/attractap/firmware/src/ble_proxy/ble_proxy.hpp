#pragma once

// Plugin BLE proxy service (ATT-1033/ATT-1036): the reader runs BLE work for the API, under a session the API
// owns. See ble_core.hpp for the state machine and README.md ("BLE proxy") for the protocol.
//
// Threads: requests arrive on the websocket task and are only parsed and queued there. The proxy task runs the
// state machine; NimBLE's host task reports radio events to it. Neither ever blocks the websocket, NFC, display
// or access control. NimBLE comes up on the first BLE request and stays until reboot, so a reader that never
// uses BLE keeps its RAM and radio as before.

#include <ArduinoJson.h>
#include <cstddef>
#include <functional>

#ifdef ESP_PLATFORM
#include "sdkconfig.h"
#endif

// Real readers only: demo variants talk to no API, park images and the desktop simulator have no NimBLE.
#if defined(ESP_PLATFORM) && !defined(DEMO_MODE) && defined(CONFIG_BT_NIMBLE_ENABLED)
#define ATTRACTAP_BLE_PROXY 1
#else
#define ATTRACTAP_BLE_PROXY 0
#endif

class BleProxy
{
public:
    struct Hooks
    {
        // One complete message to the API (thread-safe transport send). false: not taken.
        std::function<bool(const char *, size_t)> send;
        // Whether the websocket send queue has room for notifications.
        std::function<bool()> canSendNotification;
        // Reader OTA in progress: BLE work is refused.
        std::function<bool()> otaActive;
    };

    static constexpr bool supported() { return ATTRACTAP_BLE_PROXY; }

    void setup(Hooks hooks);
    // Websocket task. true: `type` is a BLE request (handled here, never ACKed). `trusted`: it came from the server
    // that authenticated this reader on the paired session channel; anything else is answered READER_UNSUPPORTED
    // `unauthenticated` and never reaches the radio.
    bool handleMessage(const char *type, JsonObjectConst payload, bool trusted);
    // The websocket connection that owned BLE work is gone (closed, or a channel switch). Any task.
    void linkLost();
    // A reader OTA starts. Any task.
    void otaStarted();
    // The websocket send queue freed a slot. Send task; wakes the proxy task only while it waits for room.
    void sendSlotFreed();
    // Adds `capabilities.ble` to READER_FIRMWARE_INFO (nothing on builds without the proxy). `scratch` must
    // outlive the serialization (ble::CAPABILITY_SCRATCH bytes).
    void fillCapability(JsonObject capabilities, char *scratch, size_t size);

    struct Impl;

private:
    Impl *impl = nullptr;
};
