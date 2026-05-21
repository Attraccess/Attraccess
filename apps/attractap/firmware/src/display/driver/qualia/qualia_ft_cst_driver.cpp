#include "qualia_ft_cst_driver.hpp"

#ifndef I2C_TOUCH_ADDR
#define I2C_TOUCH_ADDR 0x48
#endif

QualiaFtCstDriver::QualiaFtCstDriver(Logger &logger) : logger(logger) {}

bool QualiaFtCstDriver::begin()
{
    // Set up expander and RGB panel
    expander = new Arduino_XCA9554SWSPI(
        PCA_TFT_RESET, PCA_TFT_CS, PCA_TFT_SCK, PCA_TFT_MOSI,
        &Wire, 0x3F);

    rgbpanel = new Arduino_ESP32RGBPanel(
        TFT_DE, TFT_VSYNC, TFT_HSYNC, TFT_PCLK,
        TFT_R1, TFT_R2, TFT_R3, TFT_R4, TFT_R5,
        TFT_G0, TFT_G1, TFT_G2, TFT_G3, TFT_G4, TFT_G5,
        TFT_B1, TFT_B2, TFT_B3, TFT_B4, TFT_B5,
        1 /* hsync_polarity */, 50 /* hsync_front_porch */, 2 /* hsync_pulse_width */, 44 /* hsync_back_porch */,
        1 /* vsync_polarity */, 16 /* vsync_front_porch */, 2 /* vsync_pulse_width */, 18 /* vsync_back_porch */
        //    ,1, 30000000
    );

    gfx = new Arduino_RGB_Display(
        480 /* width */, 480 /* height */, rgbpanel, 0 /* rotation */, true /* auto_flush */,
        expander, GFX_NOT_DEFINED /* RST */, tl040wvs03_init_operations, sizeof(tl040wvs03_init_operations));

    // FT62xx/CST8xx parts are spec'd for up to 400kHz; 1MHz causes missed reads
    Wire.setClock(400000);

    if (!gfx->begin())
    {
        logger.error("gfx->begin() failed for Qualia driver");
        return false;
    }

    expander->pinMode(PCA_TFT_BACKLIGHT, OUTPUT);
    expander->digitalWrite(PCA_TFT_BACKLIGHT, HIGH);

    // Touch init: selected at compile time via TOUCH_DRIVER_FT6206 or TOUCH_DRIVER_CST8XX
#if defined(TOUCH_DRIVER_FT6206)
    if (focalTouch.begin(0, &Wire, I2C_TOUCH_ADDR))
    {
        logger.info("FocalTouch touchscreen found");
        touchOK = true;
        isFocalTouch = true;
    }
    else
    {
        logger.warnf("FT6206 not found at 0x%02X", I2C_TOUCH_ADDR);
        touchOK = false;
    }
#elif defined(TOUCH_DRIVER_CST8XX)
    if (cstTouch.begin(&Wire, I2C_TOUCH_ADDR))
    {
        logger.info("CST8XX touchscreen found");
        touchOK = true;
        isFocalTouch = false;
    }
    else
    {
        logger.warnf("CST8XX not found at 0x%02X", I2C_TOUCH_ADDR);
        touchOK = false;
    }
#else
    // Fallback: try both (legacy behavior)
    if (focalTouch.begin(0, &Wire, I2C_TOUCH_ADDR))
    {
        logger.info("FocalTouch touchscreen found");
        touchOK = true;
        isFocalTouch = true;
    }
    else if (cstTouch.begin(&Wire, I2C_TOUCH_ADDR))
    {
        logger.info("CST8XX touchscreen found");
        touchOK = true;
        isFocalTouch = false;
    }
    else
    {
        logger.warnf("No touchscreen found at 0x%02X", I2C_TOUCH_ADDR);
        touchOK = false;
        isFocalTouch = false;
    }
#endif

    screenWidth = gfx->width();
    screenHeight = gfx->height();

#if defined(QUALIA_TEST_PATTERN)
    drawTestPattern();
    delay(5000); // hold the pattern so we can visually confirm timings
#endif

    initialized = true;
    return true;
}

void QualiaFtCstDriver::flush(const lv_area_t *area, uint8_t *px_map)
{
    if (!initialized || !gfx)
    {
        return;
    }

    uint32_t w = (area->x2 - area->x1 + 1);
    uint32_t h = (area->y2 - area->y1 + 1);
    gfx->draw16bitRGBBitmap(area->x1, area->y1, (uint16_t *)px_map, w, h);
}

bool QualiaFtCstDriver::readTouch(TouchPoint &point)
{
    point.pressed = false;

    if (!initialized || !touchOK || !gfx)
    {
        return false;
    }

    if (isFocalTouch)
    {
        if (!focalTouch.touched())
        {
            return false;
        }
        TS_Point p = focalTouch.getPoint(0);
        point.x = p.x;
        point.y = p.y;
        point.pressed = true;
        return true;
    }

    if (!cstTouch.touched())
    {
        return false;
    }
    CST_TS_Point p = cstTouch.getPoint(0);
    point.x = p.x;
    point.y = p.y;
    point.pressed = true;
    return true;
}

void QualiaFtCstDriver::drawTestPattern()
{
    if (!gfx)
    {
        return;
    }

    const uint16_t colors[] = {
        0xF800, // red
        0x07E0, // green
        0x001F, // blue
        0xFFE0, // yellow
        0xFFFF  // white
    };

    uint16_t barWidth = screenWidth / (sizeof(colors) / sizeof(colors[0]));
    uint16_t x = 0;
    for (uint8_t i = 0; i < sizeof(colors) / sizeof(colors[0]); i++)
    {
        gfx->fillRect(x, 0, barWidth, screenHeight, colors[i]);
        x += barWidth;
    }
    // Final strip to cover any remainder
    if (x < screenWidth)
    {
        gfx->fillRect(x, 0, screenWidth - x, screenHeight, 0x0000); // black
    }
}
