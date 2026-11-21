#pragma once

// Attractap Lite (LED ring, no screen) while the Bluetooth setup window is open (ATT-1371, src/bt_setup). Hardware-free
// so it can be tested on the host, see tests/bt-setup.
//
// The ring shows the setup in blue: two short pulses every PERIOD_MS over a dim ring while it waits for the browser,
// steady blue while a browser is connected. It replaces "Configuration Required" and "Initializing" while the window
// is open. The pairing colour pattern keeps the ring (the admin compares it to approve the reader), and so does
// everything after pairing.

#include <cstdint>

namespace LedBtSetup
{
    // What the ring would show without the Bluetooth setup.
    enum class Base : uint8_t
    {
        ConfigRequired,
        Init,
        PairingPending,
        Other,
    };

    inline bool shows(Base base, bool windowOpen)
    {
        return windowOpen && (base == Base::ConfigRequired || base == Base::Init);
    }

    constexpr uint32_t PERIOD_MS = 1500;
    constexpr uint32_t PULSE_MS = 150;
    constexpr uint32_t PULSE_GAP_MS = 100;
    constexpr uint8_t DIM_LEVEL = 24;

    // Brightness (0..255) of the blue ring at `nowMs`.
    inline uint8_t level(uint32_t nowMs, bool linked)
    {
        if (linked) return 255;
        const uint32_t t = nowMs % PERIOD_MS;
        const bool pulse = t < PULSE_MS || (t >= PULSE_MS + PULSE_GAP_MS && t < 2 * PULSE_MS + PULSE_GAP_MS);
        return pulse ? 255 : DIM_LEVEL;
    }
}
