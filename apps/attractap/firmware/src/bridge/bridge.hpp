#pragma once

// BLE bridge board (ATT-1315, GL.iNet GL-S10): status LEDs and the button, on a task of their own.

#include <functional>

#include "bridge_logic.hpp"

namespace bridge
{
    // Drives the power LED right away and starts the LED/button task. `bleActivity` is polled from that task.
    void start(std::function<BleActivity()> bleActivity);
}
