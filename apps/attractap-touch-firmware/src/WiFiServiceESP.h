#ifndef WIFI_SERVICE_ESP_H
#define WIFI_SERVICE_ESP_H

#include <Arduino.h>
#include <Preferences.h>
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"

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

class WiFiServiceESP
{
public:
    // State change callback types
    typedef void (*ConnectionCallback)(bool connected, const String &ssid);
    typedef void (*ScanCompleteCallback)(WiFiNetwork *networks, uint8_t count);
    typedef void (*ScanProgressCallback)(const String &status);

    WiFiServiceESP();
    ~WiFiServiceESP();

    void begin();
    void update();

    // Connection management
    bool isConnected();
    String getConnectedSSID();
    String getLocalIP();
    void connectToNetwork(const String &ssid, const String &password = "");
    void disconnect();
    bool tryAutoConnect();

    // Network scanning
    void scanNetworks();
    bool isScanning() const { return scanning; }
    WiFiNetwork *getAvailableNetworks() { return availableNetworks; }
    uint8_t getNetworkCount() const { return networkCount; }

    // Credential persistence
    void saveCredentials(const String &ssid, const String &password);
    bool loadSavedCredentials(String &ssid, String &password);
    void clearSavedCredentials();
    bool hasSavedCredentials();

    // Connection state
    bool isConnecting() const { return connecting; }
    uint32_t getConnectionStartTime() const { return connectionStartTime; }

    // Callback registration
    void setConnectionCallback(ConnectionCallback callback) { connectionCallback = callback; }
    void setScanCompleteCallback(ScanCompleteCallback callback) { scanCompleteCallback = callback; }
    void setScanProgressCallback(ScanProgressCallback callback) { scanProgressCallback = callback; }

    WiFiCredentials getCurrentCredentials() { return currentCredentials; }

    // ESP-IDF specific methods for memory optimization
    void configureMemorySettings();

private:
    WiFiNetwork availableNetworks[MAX_WIFI_NETWORKS];
    uint8_t networkCount;
    WiFiCredentials currentCredentials;
    bool scanning;
    bool connecting;
    uint32_t connectionStartTime;
    uint32_t lastConnectionUpdate;
    bool wifi_initialized;

    // ESP network interface
    esp_netif_t *sta_netif;

    // Secure credential storage
    Preferences preferences;

    // State callbacks
    ConnectionCallback connectionCallback;
    ScanCompleteCallback scanCompleteCallback;
    ScanProgressCallback scanProgressCallback;

    // Event handlers
    static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
    static void ip_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
    static WiFiServiceESP *instance; // For static event handlers

    // Internal methods
    void initWiFi();
    void handleScanComplete();
    void handleConnectionTimeout();
    void notifyConnectionState(bool connected, const String &ssid);
    void notifyScanProgress(const String &status);

    // Utility methods
    String getEncryptionTypeString(wifi_auth_mode_t encType);
    int getSignalStrength(int32_t rssi);

    // ESP-IDF conversion helpers
    wifi_config_t createWiFiConfig(const String &ssid, const String &password);
};

#endif // WIFI_SERVICE_ESP_H