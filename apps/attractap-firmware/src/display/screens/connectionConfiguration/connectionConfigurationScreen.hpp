#pragma once

#include <Arduino.h>
#include "../../screens/IScreen.hpp"
#include "../../../settings/settings.hpp"
#include "../../shared/pinInput/pinInputPage.hpp"

class ConnectionConfigurationScreen : public IScreen
{
public:
    void init();
    lv_obj_t *getScreen() override;
    void loop() override;

    struct ConnectionConfig
    {
        String ssid;
        String password;
        String host;
        bool useSSL;
    };

    void setOnSaveCallback(std::function<void(const ConnectionConfig &)> onSaveCallback);
    void setOnCancelPinLockCallback(std::function<void()> onCancelPinLockCallback);
    void disablePinLock();
    void enablePinLock();

private:
    std::function<void(const ConnectionConfig &)> onSaveCallback;

    PinInputPage pinInputPage;
    lv_obj_t *screen;

    lv_obj_t *pinLockOverlay;
    std::function<void()> onCancelPinLockCallback;
    bool onPinLockConfirmCallback(String pin);

    lv_obj_t *tabs;
    lv_obj_t *keyboard;
    lv_obj_t *wifiSSID;
    lv_obj_t *wifiPassword;
    lv_obj_t *serverHostname;
    lv_obj_t *labelForWifiSSID;
    lv_obj_t *labelForWifiPassword;
    lv_obj_t *labelForServerHostname;
    lv_color_t labelForWifiSSIDDefaultColor;
    lv_color_t labelForWifiPasswordDefaultColor;
    lv_color_t labelForServerHostnameDefaultColor;
    lv_obj_t *useSSLSwitch;
    lv_obj_t *labelForUseSSLSwitch;
    lv_color_t labelForUseSSLSwitchDefaultColor;

    static void onTextAreaEvent(lv_event_t *e);
    static void onKeyboardEvent(lv_event_t *e);
    static void onContinueButtonEvent(lv_event_t *e);
    static void onSaveButtonEvent(lv_event_t *e);
    void showKeyboardFor(lv_obj_t *targetTextArea);
    void hideKeyboardIfNoFocus();
};