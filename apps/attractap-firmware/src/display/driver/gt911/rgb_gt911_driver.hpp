#pragma once

#include <Arduino.h>
#include <Arduino_GFX_Library.h>
#include <TouchDrvGT911.hpp>
#include <Wire.h>
#include "../../../logger/logger.hpp"
#include "../display_driver.hpp"

#ifdef HAS_IO_EXPANDER
class IOExpander;
#endif

class RgbGt911Driver : public IDisplayDriver
{
public:
#ifdef HAS_IO_EXPANDER
    RgbGt911Driver(Logger &logger, IOExpander *ioExpander = nullptr);
#else
    explicit RgbGt911Driver(Logger &logger);
#endif

    bool begin() override;
    uint32_t width() const override { return screenWidth; }
    uint32_t height() const override { return screenHeight; }
    void flush(const lv_area_t *area, uint8_t *px_map) override;
    bool readTouch(TouchPoint &point) override;
    bool touchAvailable() const override { return touchInitialized; }

private:
    Logger &logger;
#ifdef HAS_IO_EXPANDER
    IOExpander *ioExpander = nullptr;
#endif
    Arduino_DataBus *bus = nullptr;
    Arduino_ESP32RGBPanel *rgbpanel = nullptr;
    Arduino_RGB_Display *gfx = nullptr;
    TouchDrvGT911 touch;
    int16_t x[5] = {0};
    int16_t y[5] = {0};
    uint32_t screenWidth = 0;
    uint32_t screenHeight = 0;
    bool initialized = false;
    bool touchInitialized = false;
};
