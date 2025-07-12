#ifndef WIFI_SERVICE_H
#define WIFI_SERVICE_H

#include <WiFi.h>
#include <Preferences.h>

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

class WiFiService
{
public:
    // State change callback types
    typedef void (*ConnectionCallback)(bool connected, const String &ssid);
    typedef void (*ScanCompleteCallback)(WiFiNetwork *networks, uint8_t count);
    typedef void (*ScanProgressCallback)(const String &status);

    WiFiService();
    ~WiFiService();

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

private:
    WiFiNetwork availableNetworks[MAX_WIFI_NETWORKS];
    uint8_t networkCount;
    WiFiCredentials currentCredentials;
    bool scanning;
    bool connecting;
    uint32_t connectionStartTime;
    uint32_t lastConnectionUpdate;

    // Secure credential storage
    Preferences preferences;

    // State callbacks
    ConnectionCallback connectionCallback;
    ScanCompleteCallback scanCompleteCallback;
    ScanProgressCallback scanProgressCallback;

    // Internal methods
    void handleScanComplete();
    void handleConnectionTimeout();
    void notifyConnectionState(bool connected, const String &ssid);
    void notifyScanProgress(const String &status);

    // Utility methods
    String getEncryptionTypeString(wifi_auth_mode_t encType);
    int getSignalStrength(int32_t rssi);
};

#endif // WIFI_SERVICE_H