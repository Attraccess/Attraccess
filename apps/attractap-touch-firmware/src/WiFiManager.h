#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <WiFi.h>
#include <lvgl.h>
#include <Preferences.h>
#include "KeyboardManager.h"

#define MAX_WIFI_NETWORKS 20

struct WiFiNetwork
{
    String ssid;
    int32_t rssi;
    wifi_auth_mode_t encryptionType;
    bool isOpen;
    uint8_t channel;
};

struct WiFiCredentials
{
    String ssid;
    String password;
};

class WiFiManager
{
public:
    WiFiManager();
    ~WiFiManager();

    void begin();
    void update();

    bool isConnected();
    String getConnectedSSID();
    String getLocalIP();

    void showWiFiSelectionUI();
    void hideWiFiSelectionUI();
    bool isWiFiUIVisible() const { return uiVisible; } // Check if WiFi UI is currently shown

    // Context tracking for proper navigation
    enum LaunchContext
    {
        STANDALONE,
        FROM_SETTINGS
    };
    void setLaunchContext(LaunchContext context) { launchContext = context; }
    LaunchContext getLaunchContext() const { return launchContext; }

    void scanNetworks();
    void connectToNetwork(const String &ssid, const String &password = "");
    void disconnect();

    // Credential persistence
    void saveCredentials(const String &ssid, const String &password);
    bool loadSavedCredentials(String &ssid, String &password);
    void clearSavedCredentials();
    bool hasSavedCredentials();

    // Auto-connect functionality
    bool tryAutoConnect();

    // Callback function type for connection status
    typedef void (*ConnectionCallback)(bool connected, const String &ssid);
    void setConnectionCallback(ConnectionCallback callback);

private:
    WiFiNetwork availableNetworks[MAX_WIFI_NETWORKS];
    uint8_t networkCount;
    WiFiCredentials currentCredentials;
    bool isScanning;
    bool isConnecting;
    bool uiVisible;
    ConnectionCallback connectionCallback;
    uint32_t connectionStartTime;

    // Secure credential storage
    Preferences preferences;

    // LVGL UI components
    lv_obj_t *wifiScreen;
    lv_obj_t *networkList;
    lv_obj_t *scanButton;
    lv_obj_t *statusLabel;
    lv_obj_t *mainBackButton; // Back button for main WiFi screen

    // Credentials screen components
    lv_obj_t *credentialsScreen;
    lv_obj_t *selectedNetworkLabel;
    lv_obj_t *passwordTextArea;
    lv_obj_t *connectButton;
    lv_obj_t *backButton;

    // Keyboard manager
    KeyboardManager keyboardManager;

    String selectedSSID;

    // UI event handlers
    static void onNetworkSelected(lv_event_t *e);
    static void onScanButtonClicked(lv_event_t *e);
    static void onConnectButtonClicked(lv_event_t *e);
    static void onBackButtonClicked(lv_event_t *e);
    static void onMainBackButtonClicked(lv_event_t *e); // New handler for main screen back button
    static void onPasswordTextAreaClicked(lv_event_t *e);

    // UI creation methods
    void createWiFiUI();
    void createCredentialsUI();
    void updateNetworkList();
    void updateStatus(const String &message);
    void showCredentialsScreen(const String &ssid);
    void showNetworkList();

    // WiFi event handlers
    static void onWiFiEvent(WiFiEvent_t event);

    // Utility methods
    String getEncryptionTypeString(wifi_auth_mode_t encType);
    int getSignalStrength(int32_t rssi);

    // Context tracking
    LaunchContext launchContext;
};

#endif // WIFI_MANAGER_H