#pragma once

#include <cstdint>
#include "esp_io_expander.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "driver/i2c_master.h"
#include "../../../logger/logger.hpp"
#include "../display_driver.hpp"

/**
 * Adafruit Qualia S3 RGB666 display driver: TL040WVS03 480x480 RGB panel with
 * init commands bit-banged over 3-wire SPI through the on-board XCA9554 IO
 * expander (which also owns panel reset + backlight), and a FocalTech-protocol
 * capacitive touch controller (CST826 speaking the FT6206 register map) at
 * I2C 0x48 on the shared bus.
 *
 * The legacy CST8XX fallback path was dead code (TOUCH_DRIVER_FT6206 is set in
 * the shipped build) and was dropped with the Arduino port.
 */
class QualiaFtCstDriver : public IDisplayDriver
{
public:
    explicit QualiaFtCstDriver(Logger &logger);

    bool begin() override;
    uint32_t width() const override { return screenWidth; }
    uint32_t height() const override { return screenHeight; }
    void flush(const lv_area_t *area, uint8_t *px_map) override;
    bool readTouch(TouchPoint &point) override;
    bool touchAvailable() const override { return touchOK; }

private:
    Logger &logger;
    esp_io_expander_handle_t expander = nullptr;
    esp_lcd_panel_io_handle_t panelIo = nullptr;
    esp_lcd_panel_handle_t panel = nullptr;
    i2c_master_dev_handle_t touchDev = nullptr;
    bool touchOK = false;
    uint32_t screenWidth = 0;
    uint32_t screenHeight = 0;
    bool initialized = false;
};
