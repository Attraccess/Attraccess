#include "serial_console.hpp"
#include "commands.hpp"
#include "nfc_emulator/api_validation.hpp"

#include "driver/usb_serial_jtag.h"
#include "driver/usb_serial_jtag_vfs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <cstdio>

namespace nfc_emulator {
namespace {
// Every protocol line starts with this prefix so hosts can tell replies apart
// from ESP-IDF log output on the same USB serial port.
constexpr char prefix[] = "@nfc ";
constexpr size_t max_line = 8192;
constexpr int protocol_version = 1;

struct ConsoleContext { EmulatorState *state; NvsStore *store; };

void write_line(cJSON *json) {
  char *text = cJSON_PrintUnformatted(json);
  cJSON_Delete(json);
  flockfile(stdout);
  fputs(prefix, stdout);
  fputs(text ? text : "{\"ok\":false,\"error\":\"out_of_memory\",\"message\":\"reply could not be encoded\"}",
        stdout);
  fputc('\n', stdout);
  fflush(stdout);
  funlockfile(stdout);
  cJSON_free(text);
}

void send(const Reply &reply) {
  cJSON *json = cJSON_CreateObject();
  cJSON_AddBoolToObject(json, "ok", reply.ok);
  if (reply.ok) {
    cJSON_AddItemToObject(json, "result", reply.result);
  } else {
    cJSON_AddStringToObject(json, "error", reply.code);
    cJSON_AddStringToObject(json, "message", reply.message.c_str());
  }
  write_line(json);
}

void send_error(const char *code, const char *message) {
  Reply reply;
  reply.ok = false;
  reply.code = code;
  reply.message = message;
  send(reply);
}

void handle_line(ConsoleContext &context, const std::string &line) {
  std::string command, arguments_text;
  if (!parse_command_line(line, command, arguments_text))
    return send_error("invalid_command", "expected <command> [json-object]");
  cJSON *arguments = nullptr;
  if (!arguments_text.empty()) {
    arguments = cJSON_Parse(arguments_text.c_str());
    if (!cJSON_IsObject(arguments)) {
      cJSON_Delete(arguments);
      return send_error("invalid_json", "arguments must be one JSON object");
    }
  }
  send(run_command(*context.state, *context.store, command, arguments));
  cJSON_Delete(arguments);
}

void console_task(void *argument) {
  auto &context = *static_cast<ConsoleContext *>(argument);
  std::string line;
  bool overflow = false;
  uint8_t buffer[128];
  for (;;) {
    int received = usb_serial_jtag_read_bytes(buffer, sizeof(buffer), portMAX_DELAY);
    for (int index = 0; index < received; ++index) {
      char character = static_cast<char>(buffer[index]);
      if (character != '\n' && character != '\r') {
        if (line.size() < max_line) line.push_back(character);
        else overflow = true;
        continue;
      }
      if (overflow) send_error("line_too_long", "request lines are limited to 8192 bytes");
      else if (line.find_first_not_of(" \t") != std::string::npos) handle_line(context, line);
      line.clear();
      overflow = false;
    }
  }
}
}  // namespace

bool start_serial_console(EmulatorState &state, NvsStore &store) {
  usb_serial_jtag_driver_config_t config = USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT();
  config.rx_buffer_size = 1024;
  config.tx_buffer_size = 1024;
  if (usb_serial_jtag_driver_install(&config) != ESP_OK) return false;
  // Route stdout (logs and replies) through the driver so it and our reads
  // share one owner of the USB Serial/JTAG peripheral.
  usb_serial_jtag_vfs_use_driver();
  static ConsoleContext context{&state, &store};
  if (xTaskCreate(console_task, "serial-console", 8192, &context, 5, nullptr) != pdPASS)
    return false;
  cJSON *ready = cJSON_CreateObject();
  cJSON_AddStringToObject(ready, "event", "ready");
  cJSON_AddNumberToObject(ready, "protocol", protocol_version);
  write_line(ready);
  return true;
}

}  // namespace nfc_emulator
