#include "pn532_target.hpp"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace nfc_emulator {
namespace {
constexpr uint8_t address = 0x24;
constexpr char tag[] = "pn532-target";
}

bool Pn532Target::begin(gpio_num_t sda, gpio_num_t scl, gpio_num_t reset) {
  reset_pin_ = reset;
  gpio_config_t reset_config{};
  reset_config.pin_bit_mask = 1ULL << reset_pin_;
  reset_config.mode = GPIO_MODE_OUTPUT;
  if (gpio_config(&reset_config) != ESP_OK) return false;
  gpio_set_level(reset_pin_, 0);
  vTaskDelay(pdMS_TO_TICKS(10));
  gpio_set_level(reset_pin_, 1);
  vTaskDelay(pdMS_TO_TICKS(50));
  i2c_master_bus_config_t bus_config{};
  bus_config.i2c_port = I2C_NUM_0;
  bus_config.sda_io_num = sda;
  bus_config.scl_io_num = scl;
  bus_config.clk_source = I2C_CLK_SRC_DEFAULT;
  bus_config.glitch_ignore_cnt = 7;
  bus_config.flags.enable_internal_pullup = true;
  if (i2c_new_master_bus(&bus_config, &bus_) != ESP_OK) return false;

  i2c_device_config_t device_config{};
  device_config.dev_addr_length = I2C_ADDR_BIT_LEN_7;
  device_config.device_address = address;
  device_config.scl_speed_hz = 100000;
  return i2c_master_bus_add_device(bus_, &device_config, &device_) == ESP_OK;
}

bool Pn532Target::ready(uint32_t timeout_ms) {
  TickType_t start = xTaskGetTickCount();
  uint8_t status = 0;
  do {
    if (i2c_master_receive(device_, &status, 1, 20) == ESP_OK && status == 1)
      return true;
    vTaskDelay(pdMS_TO_TICKS(5));
  } while ((xTaskGetTickCount() - start) * portTICK_PERIOD_MS < timeout_ms);
  return false;
}

bool Pn532Target::write_frame(uint8_t command_byte, const Bytes &payload) {
  if (payload.size() > 253) return false;
  uint8_t length = static_cast<uint8_t>(payload.size() + 2);
  Bytes frame{0x00, 0x00, 0xff, length, static_cast<uint8_t>(0U - length),
              0xd4, command_byte};
  frame.insert(frame.end(), payload.begin(), payload.end());
  uint8_t checksum = 0xd4 + command_byte;
  for (uint8_t byte : payload) checksum = static_cast<uint8_t>(checksum + byte);
  frame.push_back(static_cast<uint8_t>(0U - checksum));
  frame.push_back(0x00);
  return i2c_master_transmit(device_, frame.data(), frame.size(), 100) == ESP_OK;
}

bool Pn532Target::read_frame(Bytes &response, uint32_t timeout_ms) {
  if (!ready(timeout_ms)) return false;
  uint8_t buffer[272]{};
  if (i2c_master_receive(device_, buffer, sizeof(buffer), 100) != ESP_OK) return false;
  // I2C status byte, then 00 00 FF LEN LCS TFI RESPONSE ... DCS 00.
  if (buffer[1] != 0 || buffer[2] != 0 || buffer[3] != 0xff ||
      static_cast<uint8_t>(buffer[4] + buffer[5]) != 0) return false;
  uint8_t length = buffer[4];
  if (length < 2 || length > 254 || buffer[6] != 0xd5) return false;
  uint8_t checksum = 0;
  for (size_t i = 6; i < 6U + length; ++i) checksum = static_cast<uint8_t>(checksum + buffer[i]);
  if (static_cast<uint8_t>(checksum + buffer[6 + length]) != 0) return false;
  response.assign(buffer + 7, buffer + 6 + length);
  return true;
}

bool Pn532Target::command(uint8_t command_byte, const Bytes &payload,
                          Bytes &response, uint32_t timeout_ms) {
  if (!begin_command(command_byte, payload)) return false;
  return read_frame(response, timeout_ms) && !response.empty() && response[0] == command_byte + 1;
}

bool Pn532Target::begin_command(uint8_t command_byte, const Bytes &payload) {
  if (!write_frame(command_byte, payload)) return false;
  if (!ready(100)) return false;
  uint8_t ack[7]{};
  if (i2c_master_receive(device_, ack, sizeof(ack), 100) != ESP_OK ||
      ack[1] != 0 || ack[2] != 0 || ack[3] != 0xff || ack[4] != 0 ||
      ack[5] != 0xff || ack[6] != 0) return false;
  return true;
}

bool Pn532Target::arm(const std::array<uint8_t, 4> &uid) {
  // Mode 0x05 enables ISO14443-4 PICC-only target mode. PN532 fixes UID byte 0
  // to 0x08; NFCID1t therefore contains only configurable bytes 1..3.
  Bytes parameters{0x05, 0x04, 0x00, uid[1], uid[2], uid[3], 0x20};
  parameters.insert(parameters.end(), 18, 0x00);  // Felica parameters
  parameters.insert(parameters.end(), 10, 0x00);  // NFCID3t
  parameters.push_back(0);                         // general bytes
  parameters.push_back(0);                         // historical bytes
  armed_ = begin_command(0x8c, parameters);
  active_ = false;
  if (!armed_) ESP_LOGW(tag, "TgInitAsTarget was not acknowledged");
  return armed_;
}

bool Pn532Target::poll_activation(uint32_t timeout_ms) {
  if (!armed_) return false;
  Bytes response;
  if (!read_frame(response, timeout_ms) || response.empty() || response[0] != 0x8d) {
    deactivate();
    return false;
  }
  armed_ = false;
  active_ = true;
  return true;
}

bool Pn532Target::receive(Bytes &apdu, uint32_t timeout_ms) {
  if (!active_) return false;
  Bytes response;
  if (!command(0x86, {}, response, timeout_ms) || response.size() < 2 || response[1] != 0) {
    deactivate();
    return false;
  }
  apdu.assign(response.begin() + 2, response.end());
  return true;
}

bool Pn532Target::respond(const Bytes &data) {
  Bytes response;
  return active_ && data.size() <= 250 && command(0x8e, data, response) &&
         response.size() > 1 && response[1] == 0;
}

void Pn532Target::deactivate() {
  active_ = false;
  armed_ = false;
  if (reset_pin_ != GPIO_NUM_NC) {
    gpio_set_level(reset_pin_, 0);
    vTaskDelay(pdMS_TO_TICKS(10));
    gpio_set_level(reset_pin_, 1);
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

}  // namespace nfc_emulator
