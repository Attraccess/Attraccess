#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <Arduino_GFX_Library.h>
#include <Adafruit_FT6206.h>
#include <Adafruit_CST8XX.h>
#include "../../../logger/logger.hpp"
#include "../display_driver.hpp"

class QualiaFtCstDriver : public IDisplayDriver
{
public:
    explicit QualiaFtCstDriver(Logger &logger);

    bool begin() override;
    uint32_t width() const override { return screenWidth; }
    uint32_t height() const override { return screenHeight; }
    void flush(const lv_area_t *area, uint8_t *px_map) override;
    bool readTouch(TouchPoint &point) override;

private:
    void drawTestPattern();

    Logger &logger;
    Arduino_XCA9554SWSPI *expander = nullptr;
    Arduino_ESP32RGBPanel *rgbpanel = nullptr;
    Arduino_RGB_Display *gfx = nullptr;
    Adafruit_FT6206 focalTouch;
    Adafruit_CST8XX cstTouch;
    bool touchOK = false;
    bool isFocalTouch = false;
    uint32_t screenWidth = 0;
    uint32_t screenHeight = 0;
    bool initialized = false;
};
