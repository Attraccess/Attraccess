#pragma once

#include <Arduino.h>
#include "../logger/logger.hpp"

#include <lvgl.h>
#include "Arduino_GFX_Library.h"
#include "lv_conf.h"
#include "HWCDC.h"
#include "TouchDrvGT911.hpp"
#include <Wire.h>
#include <SPI.h>
#include "../nfc/nfc.hpp"

class Display
{
public:
    static void setup(NFC *nfc);
    static void loop();

private:
    static NFC *nfc;
    static Logger logger;
    static Arduino_DataBus *bus;
    static Arduino_ESP32RGBPanel *rgbpanel;
    static Arduino_RGB_Display *gfx;
    static TouchDrvGT911 GT911;
    static int16_t x[5];
    static int16_t y[5];
    static uint32_t screenWidth;
    static uint32_t screenHeight;
    static lv_display_t *disp;
    static lv_indev_t *indev;
    static void increase_reboot(void *arg);
    static uint8_t reboot_count;

    static void flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map);
    static void touchpad_read(lv_indev_t *indev_driver, lv_indev_data_t *data);
    static uint32_t tick_cb();

    static void authenticateFactoryButton_event_cb(lv_event_t *event);
    static void changeKeyButton_event_cb(lv_event_t *event);
    static void authenticateButton_event_cb(lv_event_t *event);
    static void changeKeyBackButton_event_cb(lv_event_t *event);

    static lv_obj_t *demo_spinner;
    static lv_obj_t *nfc_status_label;

#if LV_USE_LOG != 0
    /* Serial debugging */
    static void debug_print(const char *buf);
#endif
};