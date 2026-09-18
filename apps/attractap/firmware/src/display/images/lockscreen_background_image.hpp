#pragma once
#include <lvgl.h>

// Bottom-left crop of the RAL5020 login wallpaper, embedded once as aligned RGB565.
extern const uint8_t lockscreen_map[] asm("_binary_lockscreen_rgb565_start");

inline const lv_image_dsc_t lockscreen_background_image = {
    .header = {
        .magic = LV_IMAGE_HEADER_MAGIC,
        .cf = LV_COLOR_FORMAT_RGB565,
        .flags = 0,
        .w = 480,
        .h = 480,
        .stride = 480 * 2,
        .reserved_2 = 0,
    },
    .data_size = 480 * 480 * 2,
    .data = lockscreen_map,
    .reserved = nullptr,
    .reserved_2 = nullptr,
};
