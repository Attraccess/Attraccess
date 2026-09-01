#pragma once

#include "nfc_emulator/model.hpp"

#include "driver/gpio.h"
#include "driver/i2c_master.h"

namespace nfc_emulator {

class Pn532Target {
 public:
  bool begin(gpio_num_t sda = GPIO_NUM_8, gpio_num_t scl = GPIO_NUM_9,
             gpio_num_t reset = GPIO_NUM_7);
  bool arm(const std::array<uint8_t, 4> &uid);
  bool poll_activation(uint32_t timeout_ms);
  bool receive(Bytes &apdu, uint32_t timeout_ms);
  bool respond(const Bytes &response);
  void deactivate();
  bool active() const { return active_; }

 private:
  bool command(uint8_t command, const Bytes &payload, Bytes &response,
               uint32_t timeout_ms = 1000);
  bool begin_command(uint8_t command, const Bytes &payload);
  bool write_frame(uint8_t command, const Bytes &payload);
  bool read_frame(Bytes &response, uint32_t timeout_ms);
  bool ready(uint32_t timeout_ms);
  bool active_ = false;
  bool armed_ = false;
  gpio_num_t reset_pin_ = GPIO_NUM_NC;
  i2c_master_bus_handle_t bus_ = nullptr;
  i2c_master_dev_handle_t device_ = nullptr;
};

}  // namespace nfc_emulator
