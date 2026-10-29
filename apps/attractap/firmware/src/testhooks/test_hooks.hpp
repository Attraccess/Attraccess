#pragma once

#include <string>

#include <ArduinoJson.h>

#include "../display/driver/display_driver.hpp"

// Serial test hooks for hardware-in-the-loop tests, compiled only with
// -DATTRACTAP_TEST_HOOKS=ON (display variants). Topics and replies are
// documented in apps/attractap/firmware/README.md ("Test hooks").
namespace TestHooks
{
    // Called by the LVGL touch read callback (lv_lock held). Returns true while
    // an injected gesture runs and fills `point` instead of the touch panel.
    bool injectedTouch(TouchPoint &point);

    // Handles the ui.* topics after the PIN check. Returns false for other topics.
    bool handleCommand(const std::string &topic, JsonObject payload);
}
