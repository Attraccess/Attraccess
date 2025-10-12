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
#include "screens/lockscreen/lockscreen.hpp"
#include "screens/IScreen.hpp"
#include "screens/init/initscreen.hpp"
#include "screens/boot/bootscreen.hpp"
#include "screens/setPin/setPinScreen.hpp"
#include "screens/unlocked/unlocked.hpp"
#include "screens/connectionConfiguration/connectionConfigurationScreen.hpp"
#include "../state/state.hpp"

class Display
{
public:
    static void setup();
    static void loop();

    static void transitionToScreen(IScreen *screen);

    static InitScreen initScreen;
    static Lockscreen lockscreen;
    static BootScreen bootScreen;
    static SetPinScreen setPinScreen;
    static ConnectionConfigurationScreen connectionConfigurationScreen;
    static Unlockedscreen unlockedScreen;

private:
    static IScreen *activeScreen;
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

#if LV_USE_LOG != 0
    /* Serial debugging */
    static void debug_print(const char *buf);
#endif
};