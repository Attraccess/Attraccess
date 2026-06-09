#include "rgb_gt911_driver.hpp"
#include "../../../utils.hpp"

#ifdef HAS_IO_EXPANDER
#include "../../../ioexpander/ioexpander.hpp"
#endif

// st7701_type1_init_operations (Arduino_RGB_Display.h) with the 180° flip done
// in the panel itself instead of in software (ATT-554 item 2):
//   - BK0 0xC7 (SDIR) = 0x04: source scan S960->S1 (X mirror)
//   - MADCTL 0x36 = 0x10 (ML): line scan bottom->top (Y mirror)
// The previous `rotation 2` made every LVGL flush take the per-pixel
// reversed-index copy path (gfx_draw_bitmap_to_framebuffer_rotate_2) into the
// PSRAM framebuffer; with the flip in hardware we can pass rotation 0 and hit
// the row-memcpy fast path. Touch coordinates are mirrored in readTouch().
static const uint8_t st7701_type1_flip180_init_operations[] = {
    BEGIN_WRITE,
    WRITE_COMMAND_8, 0xFF,
    WRITE_BYTES, 5, 0x77, 0x01, 0x00, 0x00, 0x10,

    WRITE_C8_D16, 0xC0, 0x3B, 0x00,
    WRITE_C8_D16, 0xC1, 0x0D, 0x02,
    WRITE_C8_D16, 0xC2, 0x31, 0x05,
    WRITE_C8_D8, 0xC7, 0x04, // SDIR: X mirror (180° flip, part 1)
    WRITE_C8_D8, 0xCD, 0x08,

    WRITE_COMMAND_8, 0xB0, // Positive Voltage Gamma Control
    WRITE_BYTES, 16,
    0x00, 0x11, 0x18, 0x0E,
    0x11, 0x06, 0x07, 0x08,
    0x07, 0x22, 0x04, 0x12,
    0x0F, 0xAA, 0x31, 0x18,

    WRITE_COMMAND_8, 0xB1, // Negative Voltage Gamma Control
    WRITE_BYTES, 16,
    0x00, 0x11, 0x19, 0x0E,
    0x12, 0x07, 0x08, 0x08,
    0x08, 0x22, 0x04, 0x11,
    0x11, 0xA9, 0x32, 0x18,

    // PAGE1
    WRITE_COMMAND_8, 0xFF,
    WRITE_BYTES, 5, 0x77, 0x01, 0x00, 0x00, 0x11,

    WRITE_C8_D8, 0xB0, 0x60, // Vop=4.7375v
    WRITE_C8_D8, 0xB1, 0x32, // VCOM=32
    WRITE_C8_D8, 0xB2, 0x07, // VGH=15v
    WRITE_C8_D8, 0xB3, 0x80,
    WRITE_C8_D8, 0xB5, 0x49, // VGL=-10.17v
    WRITE_C8_D8, 0xB7, 0x85,
    WRITE_C8_D8, 0xB8, 0x21, // AVDD=6.6 & AVCL=-4.6
    WRITE_C8_D8, 0xC1, 0x78,
    WRITE_C8_D8, 0xC2, 0x78,

    WRITE_COMMAND_8, 0xE0,
    WRITE_BYTES, 3, 0x00, 0x1B, 0x02,

    WRITE_COMMAND_8, 0xE1,
    WRITE_BYTES, 11,
    0x08, 0xA0, 0x00, 0x00,
    0x07, 0xA0, 0x00, 0x00,
    0x00, 0x44, 0x44,

    WRITE_COMMAND_8, 0xE2,
    WRITE_BYTES, 12,
    0x11, 0x11, 0x44, 0x44,
    0xED, 0xA0, 0x00, 0x00,
    0xEC, 0xA0, 0x00, 0x00,

    WRITE_COMMAND_8, 0xE3,
    WRITE_BYTES, 4, 0x00, 0x00, 0x11, 0x11,

    WRITE_C8_D16, 0xE4, 0x44, 0x44,

    WRITE_COMMAND_8, 0xE5,
    WRITE_BYTES, 16,
    0x0A, 0xE9, 0xD8, 0xA0,
    0x0C, 0xEB, 0xD8, 0xA0,
    0x0E, 0xED, 0xD8, 0xA0,
    0x10, 0xEF, 0xD8, 0xA0,

    WRITE_COMMAND_8, 0xE6,
    WRITE_BYTES, 4, 0x00, 0x00, 0x11, 0x11,

    WRITE_C8_D16, 0xE7, 0x44, 0x44,

    WRITE_COMMAND_8, 0xE8,
    WRITE_BYTES, 16,
    0x09, 0xE8, 0xD8, 0xA0,
    0x0B, 0xEA, 0xD8, 0xA0,
    0x0D, 0xEC, 0xD8, 0xA0,
    0x0F, 0xEE, 0xD8, 0xA0,

    WRITE_COMMAND_8, 0xEB,
    WRITE_BYTES, 7,
    0x02, 0x00, 0xE4, 0xE4,
    0x88, 0x00, 0x40,

    WRITE_C8_D16, 0xEC, 0x3C, 0x00,

    WRITE_COMMAND_8, 0xED,
    WRITE_BYTES, 16,
    0xAB, 0x89, 0x76, 0x54,
    0x02, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0x20,
    0x45, 0x67, 0x98, 0xBA,

    //-----------VAP & VAN---------------
    WRITE_COMMAND_8, 0xFF,
    WRITE_BYTES, 5, 0x77, 0x01, 0x00, 0x00, 0x13,

    WRITE_C8_D8, 0xE5, 0xE4,

    WRITE_COMMAND_8, 0xFF,
    WRITE_BYTES, 5, 0x77, 0x01, 0x00, 0x00, 0x00,

    WRITE_C8_D8, 0x36, 0x10, // MADCTL ML: Y mirror (180° flip, part 2)

    WRITE_COMMAND_8, 0x21,   // 0x20 normal, 0x21 IPS
    WRITE_C8_D8, 0x3A, 0x60, // 0x70 RGB888, 0x60 RGB666, 0x50 RGB565

    WRITE_COMMAND_8, 0x11, // Sleep Out
    END_WRITE,

    DELAY, 120,

    BEGIN_WRITE,
    WRITE_COMMAND_8, 0x29, // Display On
    END_WRITE};

#ifdef HAS_IO_EXPANDER
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

#ifdef HAS_IO_EXPANDER
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
    // SensorCommon::begin() (called inside touch.begin()) re-invokes Wire.begin() on ESP32,
    // which resets Wire.setTimeOut() back to the framework default (no timeout) and can
    // reset the bus clock back to the 100 kHz default.
    // Restore the 50 ms timeout so that subsequent I2C operations (IO expander fullRefresh,
    // NFC) do not stall indefinitely on a busy or stuck bus, and restore the 400 kHz
    // Fast Mode clock so every bus hold stays short.
    Wire.setTimeOut(50);
    Wire.setClock(ATTRACTAP_I2C_CLOCK_HZ);

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
        480 /* width */, 480 /* height */, rgbpanel, 0 /* rotation: 180° flip is done by the panel init sequence */, true /* auto_flush */,
        bus, GFX_NOT_DEFINED /* RST */, st7701_type1_flip180_init_operations, sizeof(st7701_type1_flip180_init_operations));

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

    // The 180° flip lives in the panel init sequence (gfx rotation is 0), so the
    // GT911 still reports coordinates in the unflipped orientation: mirror both
    // axes to match what is on screen.
    point.x = (int16_t)(gfx->width() - 1) - x[0];
    point.y = (int16_t)(gfx->height() - 1) - y[0];
    point.pressed = true;
    return true;
}
