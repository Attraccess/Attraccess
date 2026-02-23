#pragma once

#include <Arduino.h>
#include <vector>
#include <lvgl.h>
#include "lv_conf.h"
#include "logger/logger.hpp"
#include "display/screens/IScreen.hpp"
#include "display/screens/boot/bootscreen.hpp"
#include "display/driver/display_driver.hpp"

class Display
{
public:
    static void setup();
    static void loop();
    static void transitionToScreen(IScreen *screen);
    static void transitionToScreen(IScreen *screen, std::function<void()> onTransitionComplete);
    static void setTouchCallback(std::function<void(int16_t, int16_t)> callback);
    static void setDeviceName(String deviceName);
    static void showErrorPopup(const String &title, const String &message);
    static void showInsufficientBalancePopup(std::function<void(uint32_t amountCents)> onStart, std::function<void()> onCancel);
    static void hidePopup();

    static BootScreen bootScreen;

private:
    static Logger logger;
    static IDisplayDriver *driver;
    static uint32_t screenWidth;
    static uint32_t screenHeight;
    static lv_display_t *disp;
    static lv_indev_t *indev;
    static IScreen *activeScreen;
    static std::vector<IScreen *> pendingDestroyScreens;
    static uint32_t transitionStartTime;
    static bool transitionComplete;
    static std::function<void()> onTransitionComplete;
    static String deviceNameInitValue;
    static lv_obj_t *deviceNameLabel;
    static std::function<void(int16_t, int16_t)> touchCallback;
    static lv_obj_t *activePopup;
    static lv_timer_t *popupAutoCloseTimer;
    static uint8_t reboot_count;

    static void flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map);
    static void touchpad_read(lv_indev_t *indev_driver, lv_indev_data_t *data);
    static uint32_t tick_cb();
};
