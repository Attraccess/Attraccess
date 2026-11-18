#pragma once

// BLE bridge (ATT-1315, GL.iNet GL-S10): the decisions of the bridge board, as plain C++ so host tests can drive
// them with a test clock. bridge.cpp wires them to the GPIOs, the network interfaces and the BLE proxy.

#include <cstdint>

namespace bridge
{
    // Ethernet is preferred. Wi-Fi takes over when Ethernet had no link or no IP address for ETHERNET_GRACE_MS and
    // Wi-Fi credentials exist; it hands back as soon as Ethernet is up again.
    class NetworkFallback
    {
    public:
        static constexpr uint32_t ETHERNET_GRACE_MS = 30000;

        // Whether Wi-Fi should be connected now. `ethernetUp`: link and IP address.
        bool update(bool ethernetUp, bool wifiConfigured, uint32_t now)
        {
            if (!started || ethernetUp)
            {
                started = true;
                ethernetDownSince = now;
            }
            return !ethernetUp && wifiConfigured && now - ethernetDownSince >= ETHERNET_GRACE_MS;
        }

    private:
        bool started = false;
        uint32_t ethernetDownSince = 0;
    };

    // What the BLE proxy does, for the BT LED.
    enum class BleActivity : uint8_t
    {
        Idle,
        Scanning, // a scan or the advertisement watch runs
        Connected, // a plugin holds a BLE connection
    };

    struct LedInputs
    {
        bool networkUp = false;    // Ethernet or Wi-Fi has an IP address
        bool apiConnected = false; // the API websocket is open
        BleActivity ble = BleActivity::Idle;
        uint32_t buttonHeldMs = 0; // how long the button is held now (0: released)
        bool factoryReset = false; // the reset runs; the board reboots shortly
    };

    struct LedLevels
    {
        bool power = false;
        bool network = false;
        bool bt = false;
    };

    constexpr uint32_t SLOW_BLINK_MS = 1000;
    constexpr uint32_t FAST_BLINK_MS = 200;
    // Holding the button this long shows the factory-reset countdown on all LEDs.
    constexpr uint32_t HOLD_FEEDBACK_MS = 2000;

    inline bool blink(uint32_t now, uint32_t periodMs) { return now % periodMs < periodMs / 2; }

    // Power: on while the firmware runs. Network: on = API connected, slow blink = network up without the API,
    // fast blink = no network. BT: on = connection open, slow blink = scan or watch, off = idle. While the button
    // is held for a factory reset all three blink fast, and stay on once the reset runs.
    inline LedLevels ledLevels(const LedInputs &in, uint32_t now)
    {
        if (in.factoryReset) return {true, true, true};
        if (in.buttonHeldMs >= HOLD_FEEDBACK_MS)
        {
            const bool on = blink(now, FAST_BLINK_MS);
            return {on, on, on};
        }
        LedLevels out;
        out.power = true;
        if (in.apiConnected) out.network = true;
        else out.network = blink(now, in.networkUp ? SLOW_BLINK_MS : FAST_BLINK_MS);
        if (in.ble == BleActivity::Connected) out.bt = true;
        else if (in.ble == BleActivity::Scanning) out.bt = blink(now, SLOW_BLINK_MS);
        return out;
    }

    // The button: a short press reboots, holding it FACTORY_RESET_HOLD_MS factory-resets (while still held).
    // Releasing between SHORT_PRESS_MAX_MS and the reset cancels; presses shorter than DEBOUNCE_MS are bounces.
    class Button
    {
    public:
        enum class Action : uint8_t
        {
            None,
            Reboot,
            FactoryReset,
        };

        static constexpr uint32_t DEBOUNCE_MS = 50;
        static constexpr uint32_t SHORT_PRESS_MAX_MS = 2000;
        static constexpr uint32_t FACTORY_RESET_HOLD_MS = 10000;

        Action update(bool pressed, uint32_t now)
        {
            if (pressed && !down)
            {
                down = true;
                fired = false;
                pressedAt = now;
                return Action::None;
            }
            if (pressed)
            {
                if (fired || now - pressedAt < FACTORY_RESET_HOLD_MS) return Action::None;
                fired = true;
                return Action::FactoryReset;
            }
            if (!down) return Action::None;
            down = false;
            const uint32_t held = now - pressedAt;
            return !fired && held >= DEBOUNCE_MS && held < SHORT_PRESS_MAX_MS ? Action::Reboot : Action::None;
        }

        uint32_t heldMs(uint32_t now) const { return down ? now - pressedAt : 0; }

    private:
        bool down = false;
        bool fired = false;
        uint32_t pressedAt = 0;
    };

    // PHY of the S10 found over MDIO: LAN8720 on v1.x units, IP101 on v2.x. Both run with the generic IEEE 802.3
    // driver; the name only goes to the log.
    inline const char *phyName(uint16_t id1, uint16_t id2)
    {
        if (id1 == 0x0007 && (id2 & 0xfff0) == 0xc0f0) return "LAN8720";
        if (id1 == 0x0243 && (id2 & 0xfff0) == 0x0c50) return "IP101";
        return "unknown";
    }
}
