#ifndef SETTINGS_MANAGER_H
#define SETTINGS_MANAGER_H

#include <Arduino.h>
#include <Preferences.h>
#include <lvgl.h>
#include "KeyboardManager.h"
#include "WiFiServiceESP.h"
#include "AttraccessServiceESP.h"
#include "esp_wifi.h"

// Forward declarations for the new screen classes
class PinEntryScreen;
class SettingsListScreen;
class WiFiSettingsScreen;
class SystemSettingsScreen;
class AttraccessSettingsScreen;
class WiFiPasswordDialog;
class WiFiHiddenNetworkDialog;
class WiFiServiceESP;
class AttraccessServiceESP;
struct WiFiNetwork;

class SettingsManager
{
public:
    SettingsManager();
    ~SettingsManager();

    void begin();
    void update();

    // Main interface methods
    void showPinEntryScreen();
    void hideSettingsUI();
    bool isSettingsVisible() const;

    // Set external dependencies
    void setWiFiManager(WiFiServiceESP *service);
    void setAttraccessServiceESP(AttraccessServiceESP *service);

    // External event handlers
    void handleWiFiConnectionChange(bool connected, const String &ssid);
    void handleAttraccessConnectionChange(bool connected, bool authenticated, const String &status);

private:
    enum ScreenType
    {
        SCREEN_NONE,
        SCREEN_PIN_ENTRY,
        SCREEN_SETTINGS_LIST,
        SCREEN_WIFI_SETTINGS,
        SCREEN_SYSTEM_SETTINGS,
        SCREEN_ATTACCESS_SETTINGS
    };

    // Screen components
    PinEntryScreen *pinEntryScreen;
    SettingsListScreen *settingsListScreen;
    WiFiSettingsScreen *wifiSettingsScreen;
    SystemSettingsScreen *systemSettingsScreen;
    AttraccessSettingsScreen *attraccessSettingsScreen;
    WiFiPasswordDialog *passwordDialog;
    WiFiHiddenNetworkDialog *hiddenNetworkDialog;

    // Dependencies
    WiFiServiceESP *wifiService;
    AttraccessServiceESP *attraccessService;
    KeyboardManager keyboardManager;

    // State
    ScreenType currentScreenType;
    bool uiVisible;

    // Private methods
    void initializeCategories();
    void showSettingsListScreen();
    void showWiFiSettingsScreen();
    void showSystemSettingsScreen();
    void showAttraccessSettingsScreen();
    void returnToSettingsList();

    void saveSettings();
    void loadSettings();

    // Screen navigation callbacks
    void onPinValidationSuccess();
    void onPinValidationCancel();
    void onCategorySelected(const String &categoryId);
    void onBackToMain();
    void onBackToSettings();

    // Static WiFiServiceESP callbacks
    static void onWiFiScanComplete(WiFiNetwork *networks, uint8_t count);
    static void onWiFiScanProgress(const String &status);
    static void onWiFiConnectionChange(bool connected, const String &ssid);
};

#endif // SETTINGS_MANAGER_H