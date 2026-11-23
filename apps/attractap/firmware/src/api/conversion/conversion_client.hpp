#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

#include "conversion_link.hpp"
#include "conversion_messages.hpp"
#include "staging_format.hpp"

// The plain app's side of the conversion, steps 1-6 (ATT-1208). Internal to src/api/conversion: ReaderLink uses
// ConversionLink. conversion_client.cpp runs the transfer and the message dispatch, conversion_steps.cpp the steps
// that change flash or eFuses (staging the NVS backup, verify, burn, prepare boot + bootloader write).
#if defined(ESP_PLATFORM) && defined(ATTRACTAP_CONVERSION_CLIENT)

namespace ConversionClient
{
    // How long one chunk may take before the connection is dropped (the server answers again after a reconnect).
    constexpr uint32_t CHUNK_TIMEOUT_MS = 10000;
    // Screen and NFC are given back when the server sends nothing for this long outside the transfer.
    constexpr uint32_t IDLE_TIMEOUT_MS = 60000;
    // After the conversion ended before the burn: restart, so NFC and the normal screens come back.
    constexpr uint32_t RESTART_DELAY_MS = 2000;

    struct State
    {
        ConversionLink::Ports ports;
        bool sessionOpen = false;
        // The last offer (variant, marker and floor are checked from it; the header keeps the rest).
        bool haveOffer = false;
        ConversionMessages::Offer offer;
        Staging::Header header;
        // The transfer runs in this session.
        bool transferring = false;
        bool waiting = false;
        bool item = false; // false: app, true: bootloader
        uint32_t chunk = 0;
        uint32_t expected = 0;
        uint32_t received = 0;
        uint32_t requestedAtMs = 0;
        std::unique_ptr<uint8_t[]> buffer;
        // The screen and NFC were taken this boot: the reader restarts when the conversion stops before the burn.
        bool tookScreen = false;
        uint32_t lastCommandMs = 0;
        uint32_t restartAtMs = 0;
    };

    State &state();
    bool sendControl(const std::string &json);

    // conversion_steps.cpp
    bool stageNvs();
    // Re-collects the namespaces and re-stages them when they changed since the transfer (a renewed certificate).
    bool restageNvsIfChanged();
    void verifyStaged();
    void onBurn(JsonVariantConst message);
    void onWriteBootloader(JsonVariantConst message);
    // The flash offset of the target app slot holds the transferred image.
    bool readApp(uint32_t offset, uint8_t *out, size_t length);
    bool readBootloader(uint32_t offset, uint8_t *out, size_t length);

    // conversion_client.cpp
    void showPhase(int phase, int percent);
    // Stops the conversion for this boot; restarts the reader when it had taken the screen.
    void finish(const char *reason);
    void yieldBriefly();
}

#endif
