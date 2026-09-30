#pragma once
#include <lvgl.h>

// The legacy symbol name is retained; the asset is raw RGB565+A8, not a PNG.
extern const uint8_t logo_400w_png_data[] asm("_binary_logo_400x120_rgb565a8_start");

inline const lv_image_dsc_t logo_400w_png = {
    .header = {
        .magic = LV_IMAGE_HEADER_MAGIC,
        .cf = LV_COLOR_FORMAT_RGB565A8,
        .flags = 0,
        .w = 400,
        .h = 120,
        .stride = 400 * 2,
        .reserved_2 = 0,
    },
    .data_size = 400 * 120 * 3,
    .data = logo_400w_png_data,
    .reserved = nullptr,
    .reserved_2 = nullptr,
};
