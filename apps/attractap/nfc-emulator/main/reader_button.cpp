#include "reader_button.hpp"

#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace nfc_emulator {
namespace {
constexpr gpio_num_t pin = GPIO_NUM_4;

// vTaskDelay(n) can return up to one tick early; one extra tick keeps the
// requested time a minimum.
void hold(uint32_t milliseconds) { vTaskDelay(pdMS_TO_TICKS(milliseconds) + 1); }
}  // namespace

esp_err_t reader_button_begin() {
  // Set the level before enabling the output, so the pin never glitches high.
  esp_err_t result = gpio_set_level(pin, 0);
  if (result != ESP_OK) return result;
  gpio_config_t config = {};
  config.pin_bit_mask = 1ULL << pin;
  config.mode = GPIO_MODE_OUTPUT;
  return gpio_config(&config);
}

void reader_button_press(uint32_t press_ms, uint32_t count, uint32_t gap_ms) {
  for (uint32_t press = 0; press < count; ++press) {
    if (press > 0) hold(gap_ms);
    gpio_set_level(pin, 1);
    hold(press_ms);
    gpio_set_level(pin, 0);
  }
}

}  // namespace nfc_emulator
