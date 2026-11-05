#pragma once

#include "esp_err.h"

#include <cstdint>

namespace nfc_emulator {

// GPIO4 drives an optocoupler across a button on the reader, such as the
// Touch V1's power button. High presses the button; the pin idles low.
esp_err_t reader_button_begin();

// Presses the button `count` times, each for at least `press_ms`, releasing it
// for at least `gap_ms` in between. Blocks until the last release.
void reader_button_press(uint32_t press_ms, uint32_t count, uint32_t gap_ms);

}  // namespace nfc_emulator
