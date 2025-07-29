#ifndef WIFI_SETTINGS_SCREEN_H
#define WIFI_SETTINGS_SCREEN_H

#include <Arduino.h>
#include <lvgl.h>
#include "WiFiServiceESP.h"
#include "WiFiPasswordDialog.h"
#include "WiFiHiddenNetworkDialog.h"
#include "SettingsHeader.h"
#include "esp_wifi.h"

class WiFiSettingsScreen
{
public:
    // Callback function types
    typedef std::function<void()> BackToSettingsCallback;

    WiFiSettingsScreen();
    ~WiFiSettingsScreen();

    void begin(WiFiServiceESP *wifiSvc, WiFiPasswordDialog *passwordDlg, WiFiHiddenNetworkDialog *hiddenNetworkDlg);
    void show();
    void hide();
    void update();

    // Set callbacks
    void setBackToSettingsCallback(BackToSettingsCallback callback);

    // Check if the screen is currently visible
    bool isVisible() const;

    // External event handlers
    void onWiFiConnectionChange(bool connected, const String &ssid);

    // Public method for external scan completion notification
    void updateAvailableNetworks();

private:
    // UI components
    lv_obj_t *screen;
    SettingsHeader *header;
    lv_obj_t *refreshButton;
    lv_obj_t *addNetworkButton;
    lv_obj_t *wifiStatusLabel;
    lv_obj_t *wifiCurrentNetworkCard;
    lv_obj_t *wifiNetworksList;
    lv_obj_t *wifiScanningLabel;
    lv_obj_t *forgetWiFiButton;
    lv_obj_t *wifiConnectionProgress;
    lv_obj_t *wifiConnectionSpinner;
    lv_obj_t *wifiConnectionLabel;

    // State
    bool visible;
    String connectingNetworkSSID;
    lv_timer_t *connectionTimeoutTimer;

    // Dependencies
    WiFiServiceESP *wifiService;
    WiFiPasswordDialog *passwordDialog;
    WiFiHiddenNetworkDialog *hiddenNetworkDialog;

    // Callbacks
    BackToSettingsCallback onBackToSettings;

    // Private methods
    void createUI();
    void updateWiFiStatus();
    void refreshNetworkScan();
    void showWiFiConnectionProgress(const String &ssid, const String &status, bool isError = false);
    void hideWiFiConnectionProgress();
    void startConnectionTimeout(const String &ssid);

    // ESP-IDF WiFi helper methods
    bool isWiFiConnected();
    String getConnectedSSID();
    IPAddress getLocalIP();
    int getRSSI();

    // Event handlers
    static void onNetworkItemClicked(lv_event_t *e);
    static void onRefreshNetworksClicked(lv_event_t *e);
    static void onAddNetworkClicked(lv_event_t *e);
    static void onForgetWiFiButtonClicked(lv_event_t *e);
};

#endif // WIFI_SETTINGS_SCREEN_H