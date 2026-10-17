#pragma once
#include "esp_system.h"

struct esp_websocket_event_data_t
{
    const char *data_ptr;
    int data_len;
    int payload_len;
    int payload_offset;
};
