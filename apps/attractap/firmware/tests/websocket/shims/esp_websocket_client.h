#pragma once
#include <cstdint>
#include "freertos/FreeRTOS.h"
using esp_websocket_client_handle_t = void *;
using esp_event_base_t = const char *;
struct esp_websocket_event_data_t {};
enum ws_transport_opcodes_t { WS_TRANSPORT_OPCODES_PING = 9 };
int esp_websocket_client_send_with_opcode(esp_websocket_client_handle_t, ws_transport_opcodes_t, const uint8_t *, int, TickType_t);
