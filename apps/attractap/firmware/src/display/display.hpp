#pragma once

#include <functional>

#include <string>

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
#include "screens/pendingApproval/pendingApprovalScreen.hpp"
#include "screens/lockscreen/lockscreen.hpp"
#include "screens/sessionSummary/sessionSummaryScreen.hpp"
#include "screens/noResources/noResourcesScreen.hpp"
#include "screens/resourceList/resourceListScreen.hpp"
#include "screens/resourceDetails/resourceDetailsScreen.hpp"
#include "screens/enrollment/enrollmentScreen.hpp"
#include "screens/reset/resetScreen.hpp"
#include "screens/supervision/supervisionScreen.hpp"
#include "screens/massIntroduction/massIntroductionScreen.hpp"
#include "screens/firmwareUpdate/firmwareUpdateScreen.hpp"
#include "screens/status/statusScreen.hpp"
#include "screens/confirm/confirmScreen.hpp"
#include "screens/topUp/topUpScreen.hpp"
#include "screens/forms/formsScreen.hpp"
#include "screens/projectSelect/projectSelectScreen.hpp"
#ifdef DEMO_MODE
#include "screens/demoSettings/demoSettingsScreen.hpp"
#endif
#include "driver/display_driver.hpp"

#ifdef HAS_IO_EXPANDER
class IOExpander;
#endif

class Display
{
public:
#ifdef ATTRACTAP_HOST
    static void setup(IDisplayDriver &driver);
#elif defined(HAS_IO_EXPANDER)
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
    static PendingApprovalScreen pendingApprovalScreen;
    static Lockscreen lockscreen;
    static NoResourcesScreen noResourcesScreen;
    static SessionSummaryScreen sessionSummaryScreen;
    static ResourceListScreen resourceListScreen;
    static ResourceDetailsScreen resourceDetailsScreen;
    static EnrollmentScreen enrollmentScreen;
    static ResetScreen resetScreen;
    static SupervisionScreen supervisionScreen;
    static MassIntroductionScreen massIntroductionScreen;
    static FirmwareUpdateScreen firmwareUpdateScreen;
    static StatusScreen statusScreen;
    static ConfirmScreen confirmScreen;
    static TopUpScreen topUpScreen;
    static FormsScreen formsScreen;
    static ProjectSelectScreen projectSelectScreen;
#ifdef DEMO_MODE
    static DemoSettingsScreen demoSettingsScreen;
#endif

    static void setTouchCallback(std::function<void(int16_t, int16_t)> callback);
    static void setDeviceName(std::string deviceName);
    static void setDemoDeviceName();
    static void logFromLvgl(lv_log_level_t level, const char *buf);

    // Name of the screen the router shows last, or "" before the first one.
    static std::string activeScreenName();
    // The RGB565 frame on the panel (see IDisplayDriver::frameBuffer), or nullptr.
    // Callers hold lv_lock so no flush writes it meanwhile.
    static const uint8_t *frameBuffer();
#ifdef ATTRACTAP_HOST
    // Test access to the chrome on the top layer, which screens must keep clear of.
    struct ChromePart
    {
        const char *name;
        lv_obj_t *object;
    };
    static std::vector<ChromePart> chromeParts();
#endif

    // Returns false if the display driver reported that touch hardware was not found at init.
    static bool hasTouchInput();
    static uint32_t touchPressSequence;

    // Screens shown on top of the screen the user was on (see IScreen::parksOrigin).
    // The router keeps that origin loaded until the user returns to it.
    static bool isActive(const IScreen *screen);
    static bool transientActive();
    // Back to the origin; false when there is none (the caller resumes routing).
    static bool returnFromTransient();
    // The screen a transient screen was raised over, or nullptr.
    static const IScreen *transientOrigin() { return transientActive() ? parkedOrigin : nullptr; }
    static void showStatus(StatusScreen::Config config);
    static void showConfirm(ConfirmScreen::Config config);

    // Hidden maintenance drawer: pulled down from the top edge, exposes
    // "Open Settings" and "Reboot" actions. The settings action is wired by the
    // application; reboot is handled internally (esp_restart after a confirm).
    static void setOnOpenSettingsCallback(std::function<void()> callback);
    static void setDrawerAvailableCallback(std::function<bool()> callback);

    /**
     * Thread-safe lv_async_call: takes lv_lock() around the timer-list
     * manipulation. Use this instead of raw lv_async_call from any task other
     * than the LVGL render task (e.g. websocket callbacks) - rendering runs on
     * its own task now (ATT-554 item 7).
     */
    static void asyncCall(lv_async_cb_t cb, void *user_data);

private:
    static void setupFramebuffer();
    static constexpr uint32_t TouchWarningMs = 6000;
    static uint32_t touchWarningRemainingMs;
    static uint32_t touchWarningShownAt;
    static void updateTouchWarning();
    // Dedicated LVGL task (ATT-554 item 7): runs lv_timer_handler (rendering +
    // indev/touch reads; self-locking via lv_lock) so UI refresh no longer
    // shares the main application loop with blocking work.
    static void renderTask(void *parameter);
    static std::function<void(int16_t, int16_t)> touchCallback;
    // Instant transition: every fade frame is a full-screen software render
    // (70-90ms each at 480x480), so even a 50ms fade stalls the UI for
    // ~3 frames. Direct load removes the animation entirely — the screen
    // swap itself is free; only the single first frame renders
    // (PERFORMANCE_ANALYSIS.md A-3, measured on hardware).
    static const int TRANSITION_DURATION = 0;
    static const lv_scr_load_anim_t TRANSITION_ANIMATION = LV_SCR_LOAD_ANIM_NONE;

    // The router owns the complete transition transaction. Starting another
    // transition before this one advances cancels its completion callback.
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

    static void advanceScreenRouter();
    static void refreshVisibleTextForLanguageChange();

    static void flush(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map);
    static void touchpad_read(lv_indev_t *indev_driver, lv_indev_data_t *data);
    static uint32_t tick_cb();

    static void initDeviceOverlay();
    static void refreshChromeLanguage(const std::string &language);
    static void updateNetworkQualityOverlay();
    static lv_obj_t *deviceNameLabel;
    static FirmwareI18n::Text deviceNameInitValue;
    static void setDeviceNameText(const FirmwareI18n::Text &deviceName);
    static lv_obj_t *networkQualityContainer;
    static lv_obj_t *networkQualityLabel;
    static State::NetworkQuality networkQualityOverlayValue;
    static bool networkQualityOverlayInitialized;

    // The screen a transient screen was raised over; see returnFromTransient.
    static IScreen *parkedOrigin;

    // Maintenance drawer (display_drawer.cpp)
    static void initDrawer();
    static void openDrawer();
    static void closeDrawer();
    static void requestReboot();
    static bool isDrawerAvailable();
    static void updateDrawerAvailability();
    // Fed every touch sample from touchpad_read to detect the top-edge pull-down
    // gesture without intercepting touches destined for the active screen.
    static void handleGestureSample(int16_t x, int16_t y, bool pressed);

    static lv_obj_t *drawerBackdrop;
    static lv_obj_t *drawerGrabber;
    static lv_obj_t *drawerPanel;
    static bool drawerOpen;
    static bool rebootConfirmShown;
    static std::function<void()> onOpenSettingsCallback;
    static std::function<bool()> drawerAvailableCallback;
    static bool gestureCandidate;
    static bool gesturePrevPressed;
    static int16_t gestureStartY;
};
