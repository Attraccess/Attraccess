#pragma once
#include <lvgl.h>

// Embedded by ESP-IDF from the shared brand generator's planar RGB565+A8 asset.
extern const uint8_t logo_40h_data[] asm("_binary_logo_133x40_rgb565a8_start");

inline const lv_image_dsc_t logo_40h = {
    .header = {
        .magic = LV_IMAGE_HEADER_MAGIC,
        .cf = LV_COLOR_FORMAT_RGB565A8,
        .flags = 0,
        .w = 133,
        .h = 40,
        .stride = 133 * 2,
        .reserved_2 = 0,
    },
    .data_size = 133 * 40 * 3,
    .data = logo_40h_data,
    .reserved = nullptr,
    .reserved_2 = nullptr,
};
