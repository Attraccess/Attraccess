#include "rgb_gt911_driver.hpp"

#ifdef HAS_IO_EXPANDER_TCA9554
#include "../../../ioexpander/ioexpander.hpp"
#endif

#ifdef HAS_IO_EXPANDER_TCA9554
RgbGt911Driver::RgbGt911Driver(Logger &logger, IOExpander *ioExpander)
    : logger(logger), ioExpander(ioExpander) {}
#else
RgbGt911Driver::RgbGt911Driver(Logger &logger) : logger(logger) {}
#endif

bool RgbGt911Driver::begin()
{
    logger.infof("RgbGt911Driver::begin() starting at t=%lu ms", millis());

    // === TOUCH INIT FIRST (before display, matching Waveshare V4 demo) ===
    // The GT911 is an I2C device independent of the display hardware.
    // Waveshare's official demo initializes touch BEFORE gfx->begin().
    // Initializing after gfx->begin() causes GT911 to stop reporting touches,
    // likely because the ESP32 RGB LCD peripheral setup affects I2C bus state.
    delay(100); // Allow GT911 to settle after power-on (matches Waveshare)

#ifdef HAS_IO_EXPANDER_TCA9554
    if (ioExpander) {
        logger.info("Resetting touch panel via IO expander...");
        ioExpander->resetTouchPanel();  // Pulse TP_RST: LOW 20ms → HIGH 50ms
        logger.info("Touch panel reset complete");
    } else {
        logger.info("No IO expander — skipping touch panel reset");
    }
#endif

    // RST is on the IO expander (not direct GPIO), INT is on GPIO 16.
    touch.setPins(-1, 16);

    logger.infof("Probing GT911 at 0x%02X (SDA=%d, SCL=%d)...", GT911_SLAVE_ADDRESS_H, PIN_TOUCH_I2C_SDA, PIN_TOUCH_I2C_SCL);
    bool touchFound = touch.begin(Wire, GT911_SLAVE_ADDRESS_H, PIN_TOUCH_I2C_SDA, PIN_TOUCH_I2C_SCL);
    if (!touchFound)
    {
        logger.infof("GT911 not found at 0x%02X, trying 0x%02X...", GT911_SLAVE_ADDRESS_H, GT911_SLAVE_ADDRESS_L);
        touchFound = touch.begin(Wire, GT911_SLAVE_ADDRESS_L, PIN_TOUCH_I2C_SDA, PIN_TOUCH_I2C_SCL);
    }
    if (touchFound)
    {
        logger.infof("GT911 touch init SUCCESS at t=%lu ms", millis());
        touchInitialized = true;

        touch.setHomeButtonCallback([](void *user_data)
                                    {
            auto *lg = static_cast<Logger *>(user_data);
            if (lg)
            {
                lg->info("Home button pressed!");
            } },
                                    &logger);
        touch.setMaxTouchPoint(1);
    }
    else
    {
        logger.error("GT911 not found at either address — display will work without touch");
    }

    // === DISPLAY INIT SECOND ===
    logger.infof("Initializing ST7701 RGB display at t=%lu ms...", millis());

    bus = new Arduino_SWSPI(
        GFX_NOT_DEFINED /* DC */, 42 /* CS */,
        2 /* SCK */, 1 /* MOSI */, GFX_NOT_DEFINED /* MISO */);

    rgbpanel = new Arduino_ESP32RGBPanel(
        40 /* DE */, 39 /* VSYNC */, 38 /* HSYNC */, 41 /* PCLK */,
        46 /* R0 */, 3 /* R1 */, 8 /* R2 */, 18 /* R3 */, 17 /* R4 */,
        14 /* G0 */, 13 /* G1 */, 12 /* G2 */, 11 /* G3 */, 10 /* G4 */, 9 /* G5 */,
        5 /* B0 */, 45 /* B1 */, 48 /* B2 */, 47 /* B3 */, 21 /* B4 */,
        1 /* hsync_polarity */, 10 /* hsync_front_porch */, 8 /* hsync_pulse_width */, 50 /* hsync_back_porch */,
        1 /* vsync_polarity */, 10 /* vsync_front_porch */, 8 /* vsync_pulse_width */, 20 /* vsync_back_porch */);

    gfx = new Arduino_RGB_Display(
        480 /* width */, 480 /* height */, rgbpanel, 2 /* rotation */, true /* auto_flush */,
        bus, GFX_NOT_DEFINED /* RST */, st7701_type1_init_operations, sizeof(st7701_type1_init_operations));

    logger.info("Calling gfx->begin()...");
    gfx->begin();
    screenWidth = gfx->width();
    screenHeight = gfx->height();

    logger.infof("Display init DONE at t=%lu ms: %dx%d, rotation=%d",
                 millis(), screenWidth, screenHeight, gfx->getRotation());

    initialized = true;
    return true;
}

void RgbGt911Driver::flush(const lv_area_t *area, uint8_t *px_map)
{
    if (!initialized || !gfx)
    {
        return;
    }

    uint32_t w = (area->x2 - area->x1 + 1);
    uint32_t h = (area->y2 - area->y1 + 1);
    gfx->draw16bitRGBBitmap(area->x1, area->y1, (uint16_t *)px_map, w, h);
}

bool RgbGt911Driver::readTouch(TouchPoint &point)
{
    point.pressed = false;

    if (!initialized || !gfx || !touchInitialized)
    {
        return false;
    }

    uint8_t touched = touch.getPoint(x, y, touch.getSupportTouchPoint());

    if (touched <= 0)
    {
        return false;
    }

    logger.debugf("Touch detected: touched=%d, x=%d, y=%d", touched, x[0], y[0]);

    int16_t touchX = x[0];
    int16_t touchY = y[0];

    switch (gfx->getRotation())
    {
    case 0:
        break;
    case 1:
        touchX = y[0];
        touchY = gfx->height() - x[0];
        break;
    case 2:
        touchX = gfx->width() - x[0];
        touchY = gfx->height() - y[0];
        break;
    case 3:
        touchX = gfx->width() - y[0];
        touchY = x[0];
        break;
    default:
        break;
    }

    point.x = touchX;
    point.y = touchY;
    point.pressed = true;
    return true;
}
