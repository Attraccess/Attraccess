#pragma once

#include <cstdint>
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_io.h"
#include "../../../logger/logger.hpp"
#include "../display_driver.hpp"
#include "gt911_touch.hpp"

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
    esp_lcd_panel_io_handle_t panelIo = nullptr;
    esp_lcd_panel_handle_t panel = nullptr;
    Gt911Touch touch;
    uint32_t screenWidth = 0;
    uint32_t screenHeight = 0;
    bool initialized = false;
    bool touchInitialized = false;

    // Ghost-release suppression (ATT-541): the GT911 scans on its own 5-15 ms
    // cadence, so a 15 ms LVGL poll can land before a fresh sample exists.
    // Such "stale" polls hold the last pressed state instead of reporting a
    // release; the cap keeps a wedged controller from leaving a press stuck.
    static constexpr uint32_t TOUCH_STALE_HOLD_MS = 100;
    TouchPoint lastTouchPoint{};
    bool lastTouchPressed = false;
    uint32_t lastFreshSampleMs = 0;
};
