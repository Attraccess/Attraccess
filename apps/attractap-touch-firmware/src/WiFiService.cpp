#include "WiFiService.h"
#include <Arduino.h>

WiFiService::WiFiService()
    : networkCount(0), scanning(false), connecting(false), connectionStartTime(0),
      lastConnectionUpdate(0), connectionCallback(nullptr), scanCompleteCallback(nullptr), scanProgressCallback(nullptr)
{
}

WiFiService::~WiFiService()
{
}

void WiFiService::begin()
{
    Serial.println("WiFiService: Starting...");

    // Initialize WiFi
    WiFi.mode(WIFI_STA);

    // Don't auto-connect on startup to prevent crash loops
    // Auto-connect will be available through manual trigger
    Serial.println("WiFiService: Ready for manual connections (auto-connect disabled on startup)");
}

void WiFiService::update()
{
    // Handle connection timeout
    if (connecting)
    {
        handleConnectionTimeout();
    }

    // Handle scan completion
    if (scanning)
    {
        int scanResult = WiFi.scanComplete();
        if (scanResult >= 0)
        {
            Serial.printf("WiFiService: Scan completed with result: %d\n", scanResult);
            handleScanComplete();
        }
    }

    // Check for connection state changes
    static bool lastConnectedState = false;
    bool currentConnectedState = WiFi.isConnected();

    if (currentConnectedState != lastConnectedState)
    {
        lastConnectedState = currentConnectedState;
        if (currentConnectedState)
        {
            connecting = false;
            notifyConnectionState(true, WiFi.SSID());

            // Save credentials if connection successful
            if (!currentCredentials.ssid.isEmpty())
            {
                saveCredentials(currentCredentials.ssid, currentCredentials.password);
            }
        }
        else
        {
            notifyConnectionState(false, "");
        }
    }
}

bool WiFiService::isConnected()
{
    return WiFi.isConnected();
}

String WiFiService::getConnectedSSID()
{
    return WiFi.SSID();
}

String WiFiService::getLocalIP()
{
    return WiFi.localIP().toString();
}

void WiFiService::connectToNetwork(const String &ssid, const String &password)
{
    if (connecting)
    {
        Serial.println("WiFiService: Already connecting...");
        return;
    }

    // Disconnect from any existing connection first
    if (WiFi.isConnected())
    {
        WiFi.disconnect();
    }

    currentCredentials.ssid = ssid;
    currentCredentials.password = password;
    connecting = true;
    connectionStartTime = millis();
    lastConnectionUpdate = 0; // Reset animation counter

    Serial.println("WiFiService: Connecting to " + ssid + "...");
    notifyScanProgress("Connecting to " + ssid + "...");

    // Start connection attempt
    if (password.length() > 0)
    {
        WiFi.begin(ssid.c_str(), password.c_str());
    }
    else
    {
        WiFi.begin(ssid.c_str());
    }
}

void WiFiService::disconnect()
{
    connecting = false;
    WiFi.disconnect();
    Serial.println("WiFiService: Disconnected");
    notifyConnectionState(false, "");
}

bool WiFiService::tryAutoConnect()
{
    String savedSSID, savedPassword;

    if (!loadSavedCredentials(savedSSID, savedPassword))
    {
        return false; // No saved credentials
    }

    Serial.println("WiFiService: Attempting auto-connect to: " + savedSSID);
    connectToNetwork(savedSSID, savedPassword);
    return true;
}

void WiFiService::scanNetworks()
{
    Serial.printf("WiFiService: scanNetworks called - scanning=%d, connecting=%d\n", scanning, connecting);

    if (scanning || connecting)
    {
        Serial.println("WiFiService: Scan already in progress or connecting - aborting");
        return;
    }

    scanning = true;
    networkCount = 0;
    Serial.println("WiFiService: Starting network scan...");
    notifyScanProgress("Scanning for networks...");

    WiFi.scanNetworks(true, false, false, 300U, 0U);
    Serial.println("WiFiService: WiFi.scanNetworks() call completed");
}

void WiFiService::saveCredentials(const String &ssid, const String &password)
{
    Serial.println("WiFiService: Saving credentials for " + ssid);

    if (preferences.begin("wifi_creds", false))
    {
        preferences.putString("ssid", ssid);
        preferences.putString("password", password);
        preferences.putBool("has_creds", true);
        preferences.end();
        Serial.println("WiFiService: Credentials saved successfully");
    }
    else
    {
        Serial.println("WiFiService: Failed to save credentials");
    }
}

bool WiFiService::loadSavedCredentials(String &ssid, String &password)
{
    if (preferences.begin("wifi_creds", true))
    {
        bool hasCreds = preferences.getBool("has_creds", false);

        if (hasCreds)
        {
            ssid = preferences.getString("ssid", "");
            password = preferences.getString("password", "");
            preferences.end();

            if (ssid.length() > 0)
            {
                Serial.println("WiFiService: Loaded credentials for: " + ssid);
                return true;
            }
        }
        preferences.end();
    }

    return false;
}

void WiFiService::clearSavedCredentials()
{
    Serial.println("WiFiService: Clearing saved credentials...");

    if (preferences.begin("wifi_creds", false))
    {
        preferences.clear();
        preferences.end();
        Serial.println("WiFiService: Credentials cleared");
    }
}

bool WiFiService::hasSavedCredentials()
{
    if (preferences.begin("wifi_creds", true))
    {
        bool hasCreds = preferences.getBool("has_creds", false);
        preferences.end();
        return hasCreds;
    }
    return false;
}

void WiFiService::handleScanComplete()
{
    int scanResult = WiFi.scanComplete();

    if (scanResult == WIFI_SCAN_FAILED)
    {
        Serial.println("WiFiService: Scan failed");
        notifyScanProgress("Scan failed");
        scanning = false;
        return;
    }

    networkCount = min(scanResult, (int)MAX_WIFI_NETWORKS);
    Serial.printf("WiFiService: Found %d networks\n", networkCount);

    // Copy scan results to our network array
    for (uint8_t i = 0; i < networkCount; i++)
    {
        availableNetworks[i].ssid = WiFi.SSID(i);
        availableNetworks[i].rssi = WiFi.RSSI(i);
        availableNetworks[i].encryptionType = WiFi.encryptionType(i);
        availableNetworks[i].isOpen = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
        availableNetworks[i].channel = WiFi.channel(i);
    }

    scanning = false;
    notifyScanProgress("Scan complete");

    // Notify subscribers
    if (scanCompleteCallback)
    {
        Serial.printf("WiFiService: Calling scan complete callback with %d networks\n", networkCount);
        scanCompleteCallback(availableNetworks, networkCount);
    }
    else
    {
        Serial.println("WiFiService: No scan complete callback registered!");
    }

    // Clean up WiFi scan data to free memory
    WiFi.scanDelete();
}

void WiFiService::handleConnectionTimeout()
{
    uint32_t currentTime = millis();
    if (currentTime - connectionStartTime > 15000)
    { // 15 second timeout
        Serial.println("WiFiService: Connection timeout - stopping connection attempt");
        connecting = false;
        WiFi.disconnect();

        // Wait a moment before notifying to avoid race conditions
        delay(100);

        notifyScanProgress("Connection timeout");
        notifyConnectionState(false, currentCredentials.ssid);

        // Clear credentials to prevent auto-retry
        currentCredentials.ssid = "";
        currentCredentials.password = "";
    }
    else
    {
        // Update connecting status with animation (less frequently to reduce spam)
        uint32_t elapsed = (currentTime - connectionStartTime) / 1000; // Every second instead of 500ms
        if (elapsed != lastConnectionUpdate)
        {
            lastConnectionUpdate = elapsed;
            String dots = "";
            for (int i = 0; i < (elapsed % 4); i++)
            {
                dots += ".";
            }
            notifyScanProgress("Connecting" + dots);
        }
    }
}

void WiFiService::notifyConnectionState(bool connected, const String &ssid)
{
    if (connectionCallback)
    {
        // Add safety check and try-catch equivalent for ESP32
        Serial.printf("WiFiService: Notifying connection state - connected=%d, ssid=%s\n", connected, ssid.c_str());
        connectionCallback(connected, ssid);
    }
}

void WiFiService::notifyScanProgress(const String &status)
{
    if (scanProgressCallback)
    {
        scanProgressCallback(status);
    }
}

String WiFiService::getEncryptionTypeString(wifi_auth_mode_t encType)
{
    switch (encType)
    {
    case WIFI_AUTH_OPEN:
        return "Open";
    case WIFI_AUTH_WEP:
        return "WEP";
    case WIFI_AUTH_WPA_PSK:
        return "WPA";
    case WIFI_AUTH_WPA2_PSK:
        return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK:
        return "WPA/WPA2";
    case WIFI_AUTH_WPA2_ENTERPRISE:
        return "WPA2 Enterprise";
    default:
        return "Unknown";
    }
}

int WiFiService::getSignalStrength(int32_t rssi)
{
    if (rssi >= -50)
        return 4; // Excellent
    else if (rssi >= -60)
        return 3; // Good
    else if (rssi >= -70)
        return 2; // Fair
    else if (rssi >= -80)
        return 1; // Weak
    else
        return 0; // Very weak
}