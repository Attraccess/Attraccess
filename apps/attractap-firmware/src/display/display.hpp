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
#include "../logger/logger.hpp"
#include "../state/state.hpp"
#include "screens/IScreen.hpp"
#include "screens/boot/bootscreen.hpp"
#include "screens/setPin/setPinScreen.hpp"
#include "screens/connectionConfiguration/connectionConfigurationScreen.hpp"
#include "screens/init/initscreen.hpp"
#include "screens/lockscreen/lockscreen.hpp"
#include "screens/noResources/noResourcesScreen.hpp"
#include "screens/resourceList/resourceListScreen.hpp"
#include "screens/resourceDetails/resourceDetailsScreen.hpp"
#include "screens/enrollment/enrollmentScreen.hpp"

class Display
{
public:
    static void setup();
    static void loop();

    static void transitionToScreen(IScreen *screen);
    static void transitionToScreen(IScreen *screen, std::function<void()> onTransitionComplete);

    static BootScreen bootScreen;
    static SetPinScreen setPinScreen;
    static ConnectionConfigurationScreen connectionConfigurationScreen;
    static InitScreen initScreen;
    static Lockscreen lockscreen;
    static NoResourcesScreen noResourcesScreen;
    static ResourceListScreen resourceListScreen;
    static ResourceDetailsScreen resourceDetailsScreen;
    static EnrollmentScreen enrollmentScreen;

    static void setTouchCallback(std::function<void(int16_t, int16_t)> callback);

private:
    static std::function<void(int16_t, int16_t)> touchCallback;
    static const int TRANSITION_DURATION = 500;
    // static const int TRANSITION_DURATION = 50;
    static const lv_scr_load_anim_t TRANSITION_ANIMATION = LV_SCR_LOAD_ANIM_FADE_IN;
    static uint32_t transitionStartTime;
    static bool transitionComplete;
    static std::function<void()> onTransitionComplete;
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