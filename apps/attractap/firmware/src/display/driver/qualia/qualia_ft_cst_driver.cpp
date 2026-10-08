#include "qualia_ft_cst_driver.hpp"
#include "../../../platform.hpp"
#include "../../../utils.hpp"
#include "qualia_pins.hpp"

#include "esp_io_expander_tca9554.h"
#include "esp_lcd_panel_rgb.h"
#include "esp_lcd_panel_vendor.h"
#include "esp_lcd_panel_io_additions.h"
#include "esp_lcd_st7701.h"

#ifndef I2C_TOUCH_ADDR
#define I2C_TOUCH_ADDR 0x48
#endif

// FocalTech register map (FT6206 / CST826-compatible)
#define FT_REG_TD_STATUS 0x02 // number of touch points (low nibble)

QualiaFtCstDriver::QualiaFtCstDriver(Logger &logger) : logger(logger) {}

void QualiaFtCstDriver::flush(const lv_area_t *area, uint8_t *px_map)
{
    if (!initialized || !panel)
    {
        return;
    }

    esp_lcd_panel_draw_bitmap(panel, area->x1, area->y1, area->x2 + 1, area->y2 + 1, px_map);
}

bool QualiaFtCstDriver::readTouch(TouchPoint &point)
{
    point.pressed = false;

    if (!initialized || !touchOK || !touchDev)
    {
        return false;
    }

    // Serialize the touch read against PN532 traffic on the shared bus
    // (ATT-554) — same rationale as RgbGt911Driver::readTouch.
    I2CBusGuard busGuard;

    // One burst read: TD_STATUS + P1 XH/XL/YH/YL — a single atomic transaction.
    uint8_t reg = FT_REG_TD_STATUS;
    uint8_t data[5] = {0};
    if (i2c_master_transmit_receive(touchDev, &reg, 1, data, sizeof(data), ATTRACTAP_I2C_XFER_TIMEOUT_MS) != ESP_OK)
    {
        return false;
    }

    uint8_t touches = data[0] & 0x0F;
    if (touches == 0 || touches > 2)
    {
        return false;
    }

    point.x = (int16_t)(((data[1] & 0x0F) << 8) | data[2]);
    point.y = (int16_t)(((data[3] & 0x0F) << 8) | data[4]);
    point.pressed = true;
    return true;
}

#ifndef I2C_TOUCH_ADDR
#define I2C_TOUCH_ADDR 0x48
#endif

// FocalTech register map (FT6206 / CST826-compatible)

#include "st7701_qualia_commands.hpp"

bool QualiaFtCstDriver::begin()
{
    // === XCA9554 IO expander (panel reset / backlight / init-SPI lines) ===
    esp_err_t err = esp_io_expander_new_i2c_tca9554(getSharedI2CBus(), QUALIA_IOEXPANDER_I2C_ADDR, &expander);
    if (err != ESP_OK)
    {
        logger.errorf("XCA9554 expander init failed: %s", esp_err_to_name(err));
        return false;
    }

    // Panel hardware reset via the expander — same pulse Arduino_XCA9554SWSPI
    // performed in its begin(): low 10 ms -> high 100 ms.
    esp_io_expander_set_dir(expander, 1 << QUALIA_PCA_TFT_RESET, IO_EXPANDER_OUTPUT);
    esp_io_expander_set_level(expander, 1 << QUALIA_PCA_TFT_RESET, 0);
    delay(10);
    esp_io_expander_set_level(expander, 1 << QUALIA_PCA_TFT_RESET, 1);
    delay(100);

    // === Panel init over 3-wire SPI bit-banged through the expander ===
    spi_line_config_t lineConfig = {};
    lineConfig.cs_io_type = IO_TYPE_EXPANDER;
    lineConfig.cs_expander_pin = (esp_io_expander_pin_num_t)(1 << QUALIA_PCA_TFT_CS);
    lineConfig.scl_io_type = IO_TYPE_EXPANDER;
    lineConfig.scl_expander_pin = (esp_io_expander_pin_num_t)(1 << QUALIA_PCA_TFT_SCK);
    lineConfig.sda_io_type = IO_TYPE_EXPANDER;
    lineConfig.sda_expander_pin = (esp_io_expander_pin_num_t)(1 << QUALIA_PCA_TFT_MOSI);
    lineConfig.io_expander = expander;

    esp_lcd_panel_io_3wire_spi_config_t ioConfig = ST7701_PANEL_IO_3WIRE_SPI_CONFIG(lineConfig, 0);
    err = esp_lcd_new_panel_io_3wire_spi(&ioConfig, &panelIo);
    if (err != ESP_OK)
    {
        logger.errorf("3-wire SPI panel IO init failed: %s", esp_err_to_name(err));
        return false;
    }

    // RGB dot-clock config — replicates the effective Arduino_ESP32RGBPanel
    // values: 12 MHz pclk, single PSRAM framebuffer, no bounce buffers,
    // 16-bit bus, little-endian B/G/R lane order. The Arduino ctor was fed
    // R1..R5/B1..B5 as its "r0..r4"/"b0..b4" inputs — preserved verbatim.
    esp_lcd_rgb_panel_config_t rgbConfig = {};
    rgbConfig.clk_src = LCD_CLK_SRC_DEFAULT;
    rgbConfig.timings.pclk_hz = 12 * 1000 * 1000;
    rgbConfig.timings.h_res = 480;
    rgbConfig.timings.v_res = 480;
    rgbConfig.timings.hsync_front_porch = 50;
    rgbConfig.timings.hsync_pulse_width = 2;
    rgbConfig.timings.hsync_back_porch = 44;
    rgbConfig.timings.vsync_front_porch = 16;
    rgbConfig.timings.vsync_pulse_width = 2;
    rgbConfig.timings.vsync_back_porch = 18;
    rgbConfig.timings.flags.hsync_idle_low = 0; // polarity 1
    rgbConfig.timings.flags.vsync_idle_low = 0; // polarity 1
    rgbConfig.timings.flags.de_idle_high = 0;
    rgbConfig.timings.flags.pclk_active_neg = 0;
    rgbConfig.timings.flags.pclk_idle_high = 0;
    rgbConfig.data_width = 16;
    rgbConfig.in_color_format = LCD_COLOR_FMT_RGB565;
    rgbConfig.out_color_format = LCD_COLOR_FMT_RGB565;
    rgbConfig.num_fbs = 1;
    rgbConfig.bounce_buffer_size_px = 0;
    rgbConfig.dma_burst_size = 64;
    rgbConfig.hsync_gpio_num = (gpio_num_t)QUALIA_TFT_HSYNC;
    rgbConfig.vsync_gpio_num = (gpio_num_t)QUALIA_TFT_VSYNC;
    rgbConfig.de_gpio_num = (gpio_num_t)QUALIA_TFT_DE;
    rgbConfig.pclk_gpio_num = (gpio_num_t)QUALIA_TFT_PCLK;
    rgbConfig.disp_gpio_num = (gpio_num_t)-1;
    // Little-endian lane order (data[0..4]=B, [5..10]=G, [11..15]=R)
    const int dataPins[16] = {
        QUALIA_TFT_B1, QUALIA_TFT_B2, QUALIA_TFT_B3, QUALIA_TFT_B4, QUALIA_TFT_B5,
        QUALIA_TFT_G0, QUALIA_TFT_G1, QUALIA_TFT_G2, QUALIA_TFT_G3, QUALIA_TFT_G4, QUALIA_TFT_G5,
        QUALIA_TFT_R1, QUALIA_TFT_R2, QUALIA_TFT_R3, QUALIA_TFT_R4, QUALIA_TFT_R5};
    for (int i = 0; i < 16; i++)
    {
        rgbConfig.data_gpio_nums[i] = (gpio_num_t)dataPins[i];
    }
    rgbConfig.flags.disp_active_low = 1;
    rgbConfig.flags.fb_in_psram = 1;

    st7701_vendor_config_t vendorConfig = {};
    vendorConfig.init_cmds = tl040wvs03_init_cmds;
    vendorConfig.init_cmds_size = sizeof(tl040wvs03_init_cmds) / sizeof(st7701_lcd_init_cmd_t);
    vendorConfig.rgb_config = &rgbConfig;
    vendorConfig.flags.use_mipi_interface = 0;
    vendorConfig.flags.mirror_by_cmd = 0;
    vendorConfig.flags.auto_del_panel_io = 0;

    esp_lcd_panel_dev_config_t panelConfig = {};
    panelConfig.reset_gpio_num = (gpio_num_t)-1; // reset is on the expander, pulsed above
    panelConfig.rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB;
    panelConfig.bits_per_pixel = 16;
    panelConfig.vendor_config = &vendorConfig;

    err = esp_lcd_new_panel_st7701(panelIo, &panelConfig, &panel);
    if (err != ESP_OK)
    {
        logger.errorf("esp_lcd_new_panel_st7701 failed: %s", esp_err_to_name(err));
        return false;
    }
    err = esp_lcd_panel_reset(panel);
    if (err == ESP_OK)
    {
        err = esp_lcd_panel_init(panel); // sends the init table, then starts RGB refresh
    }
    if (err != ESP_OK)
    {
        logger.errorf("TL040WVS03 panel init failed: %s", esp_err_to_name(err));
        return false;
    }

    // Backlight on (expander pin)
    esp_io_expander_set_dir(expander, 1 << QUALIA_PCA_TFT_BACKLIGHT, IO_EXPANDER_OUTPUT);
    esp_io_expander_set_level(expander, 1 << QUALIA_PCA_TFT_BACKLIGHT, 1);

    // === Touch: FocalTech-protocol controller @0x48 on the shared bus ===
    // (CST826 speaking the FT6206 register map; FT62xx/CST8xx parts are spec'd
    // for up to 400 kHz, which is the shared-bus device clock.)
    touchDev = addSharedI2CDevice(I2C_TOUCH_ADDR);
    if (touchDev)
    {
        uint8_t reg = FT_REG_TD_STATUS;
        uint8_t probe = 0;
        if (i2c_master_transmit_receive(touchDev, &reg, 1, &probe, 1, ATTRACTAP_I2C_XFER_TIMEOUT_MS) == ESP_OK)
        {
            logger.info("FocalTech touchscreen found");
            touchOK = true;
        }
        else
        {
            logger.warnf("FocalTech touch not responding at 0x%02X", I2C_TOUCH_ADDR);
        }
    }

    screenWidth = 480;
    screenHeight = 480;

    initialized = true;
    return true;
}
