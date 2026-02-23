#pragma once

#if defined(CONFIG_IDF_TARGET_ESP32P4)

#include <Arduino.h>
#include <Arduino_GFX_Library.h>
#include <TouchDrvGT911.hpp>
#include <Wire.h>
#include "../../../logger/logger.hpp"
#include "../display_driver.hpp"

/**
 * ESP32-P4 DSI display driver with GT911 touch.
 * For 4.3" MIPI DSI displays (e.g. 4DS, AliExpress ESP32-P4+C6 boards).
 */
class P4DsiGt911Driver : public IDisplayDriver
{
public:
    explicit P4DsiGt911Driver(Logger &logger);

    bool begin() override;
    uint32_t width() const override { return screenWidth; }
    uint32_t height() const override { return screenHeight; }
    void flush(const lv_area_t *area, uint8_t *px_map) override;
    bool readTouch(TouchPoint &point) override;

private:
    Logger &logger;
    Arduino_ESP32DSIPanel *dsipanel = nullptr;
    Arduino_DSI_Display *gfx = nullptr;
    TouchDrvGT911 touch;
    int16_t x[5] = {0};
    int16_t y[5] = {0};
    uint32_t screenWidth = 0;
    uint32_t screenHeight = 0;
    bool initialized = false;
};

#endif // CONFIG_IDF_TARGET_ESP32P4
