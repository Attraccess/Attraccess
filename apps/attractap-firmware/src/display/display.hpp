#pragma once

#include <Arduino.h>
#include <vector>
#include <lvgl.h>
#include "lv_conf.h"
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
#include "screens/firmwareUpdate/firmwareUpdateScreen.hpp"
#include "driver/display_driver.hpp"

#ifdef HAS_IO_EXPANDER_TCA9554
class IOExpander;
#endif

class Display
{
public:
#ifdef HAS_IO_EXPANDER_TCA9554
    static void setup(IOExpander *ioExpander = nullptr);
#else
    static void setup();
#endif
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
    static FirmwareUpdateScreen firmwareUpdateScreen;

    static void setTouchCallback(std::function<void(int16_t, int16_t)> callback);
    static void setDeviceName(String deviceName);
    static void logFromLvgl(lv_log_level_t level, const char *buf);

    // Global error popup helpers
    static void showErrorPopup(const String &title, const String &message);
    static void showInsufficientBalancePopup(std::function<void(uint32_t amountCents)> onStart, std::function<void()> onCancel);
    static void hidePopup();

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
    static IDisplayDriver *driver;
    static uint32_t screenWidth;
    static uint32_t screenHeight;
    static lv_display_t *disp;
    static lv_indev_t *indev;
    static std::vector<IScreen *> pendingDestroyScreens;
    static void increase_reboot(void *arg);
    static uint8_t reboot_count;

    static void flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map);
    static void touchpad_read(lv_indev_t *indev_driver, lv_indev_data_t *data);
    static uint32_t tick_cb();

    static void initDeviceOverlay();
    static lv_obj_t *deviceNameLabel;
    static String deviceNameInitValue;

    static lv_obj_t *activePopup;
    static lv_timer_t *popupAutoCloseTimer;
};