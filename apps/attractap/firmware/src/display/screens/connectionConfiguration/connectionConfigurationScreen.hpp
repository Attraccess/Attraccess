#pragma once

#include <functional>

#include <string>
#include "../../screens/IScreen.hpp"
#include "../../../settings/settings.hpp"
#include "../../shared/pinInput/pinInputPage.hpp"
#include "../../shared/powerOff/powerOffButton.hpp"

class ConnectionConfigurationScreen : public IScreen
{
public:
    void init();
    void onScreenLeave();
    lv_obj_t *getScreen() override;
    void loop() override;
    std::string getName() override;
    void destroy() override;

    struct ConnectionConfig
    {
        std::string ssid;
        std::string password;
        std::string host;
        bool useSSL;
        std::string devicePin;
        bool beeperEnabled;
    };

    void setOnSaveCallback(std::function<void(const ConnectionConfig &)> onSaveCallback);
    void setOnCancelPinLockCallback(std::function<void()> onCancelPinLockCallback);
    void setOnResetCertificateCallback(std::function<void()> onResetCertificateCallback);
#ifdef HAS_POWER_BUTTON
    // Application wires this to IOExpander::powerOff(). Invoked after the user
    // confirms the power-off dialog on the "Geraet" tab.
    void setOnPowerOffCallback(std::function<void()> cb) { onPowerOffCallback = cb; }
#endif
    void disablePinLock();
    void enablePinLock();

private:
    std::function<void(const ConnectionConfig &)> onSaveCallback;
    std::function<void()> onResetCertificateCallback;
#ifdef HAS_POWER_BUTTON
    std::function<void()> onPowerOffCallback;
#endif

    PinInputPage pinInputPage;
    lv_obj_t *screen = nullptr;

    lv_obj_t *pinLockOverlay = nullptr;
    bool pinLockEnabled = true;
    std::function<void()> onCancelPinLockCallback;
    bool onPinLockConfirmCallback(std::string pin);

    lv_obj_t *tabs = nullptr;
    lv_obj_t *keyboard = nullptr;
    lv_obj_t *wifiSSID = nullptr;
    lv_obj_t *wifiPassword = nullptr;
    lv_obj_t *serverHostname = nullptr;
    lv_obj_t *labelForWifiSSID = nullptr;
    lv_obj_t *labelForWifiPassword = nullptr;
    lv_obj_t *labelForServerHostname = nullptr;
    lv_color_t labelForWifiSSIDDefaultColor;
    lv_color_t labelForWifiPasswordDefaultColor;
    lv_color_t labelForServerHostnameDefaultColor;
    lv_obj_t *useSSLSwitch = nullptr;
    lv_obj_t *labelForUseSSLSwitch = nullptr;
    lv_color_t labelForUseSSLSwitchDefaultColor;
    lv_obj_t *resetCertButton = nullptr;
    lv_obj_t *resetCertLabel = nullptr;

    static void onTextAreaEvent(lv_event_t *e);
    static void onKeyboardEvent(lv_event_t *e);
    static void onSaveButtonEvent(lv_event_t *e);
    static void onResetCertificateButtonEvent(lv_event_t *e);
    static void onWifiDropdownEvent(lv_event_t *e);
    void showKeyboardFor(lv_obj_t *targetTextArea);
    void hideKeyboardIfNoFocus();

    void startWifiScan();
    void populateWifiDropdown();

    lv_obj_t *devicePin = nullptr;
    lv_obj_t *labelForDevicePin = nullptr;
    lv_color_t labelForDevicePinDefaultColor;

    lv_obj_t *beeperEnabled = nullptr;

    lv_obj_t *wifiSelectNetwork = nullptr;
    bool wifiScanRequested = false;
    bool wifiScanCompleted = false;
    uint32_t wifiScanStartMs = 0;
    bool wifiDropdownHasNetworks = false;

    lv_obj_t *networkQualityStatus = nullptr;
    uint32_t lastNetworkQualityStatusUpdateMs = 0;
    void updateNetworkQualityStatus();

    lv_obj_t *createSaveButton(lv_obj_t *parent);
    lv_obj_t *createSaveContainer(lv_obj_t *parent);
};
