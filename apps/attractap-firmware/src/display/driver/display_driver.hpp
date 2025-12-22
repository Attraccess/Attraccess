#pragma once

#include <stdint.h>
#include <lvgl.h>

struct TouchPoint
{
    int16_t x;
    int16_t y;
    bool pressed;
};

class IDisplayDriver
{
public:
    virtual ~IDisplayDriver() = default;

    virtual bool begin() = 0;
    virtual uint32_t width() const = 0;
    virtual uint32_t height() const = 0;

    // LVGL flush callback helper: px_map is provided by LVGL in configured color format.
    virtual void flush(const lv_area_t *area, uint8_t *px_map) = 0;

    // Returns true when a touch is active and fills the point in display coordinates.
    virtual bool readTouch(TouchPoint &point) = 0;
};
