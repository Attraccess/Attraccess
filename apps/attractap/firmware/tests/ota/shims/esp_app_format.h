#pragma once
#include <cstdint>
constexpr uint8_t ESP_IMAGE_HEADER_MAGIC = 0xe9;
struct esp_image_header_t
{
    uint8_t magic;
    uint8_t remainingHeader[23];
};
