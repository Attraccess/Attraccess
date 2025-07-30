#include "WiFiServiceESP.h"
#include <Arduino.h>
#include "lwip/err.h"
#include "lwip/sys.h"
#include "esp_log.h"

static const char *TAG = "WiFiServiceESP";

// Static instance for event handlers
WiFiServiceESP *WiFiServiceESP::instance = nullptr;

WiFiServiceESP::WiFiServiceESP()
    : networkCount(0), scanning(false), connecting(false), connectionStartTime(0),
      lastConnectionUpdate(0), wifi_initialized(false), sta_netif(nullptr),
      autoReconnectEnabled(true), lastReconnectAttempt(0), reconnectInterval(30000),
      reconnectAttempts(0), maxReconnectAttempts(10),
      connectionCallback(nullptr), scanCompleteCallback(nullptr), scanProgressCallback(nullptr)
{
    instance = this;
}

WiFiServiceESP::~WiFiServiceESP()
{
    if (wifi_initialized)
    {
        esp_wifi_stop();
        esp_wifi_deinit();
    }
    instance = nullptr;
}

void WiFiServiceESP::begin()
{
    Serial.println("WiFiServiceESP: Starting ESP-IDF WiFi...");

    // Initialize network interface
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    sta_netif = esp_netif_create_default_wifi_sta();

    // Configure memory settings for lower RAM usage
    configureMemorySettings();

    initWiFi();

    Serial.println("WiFiServiceESP: Ready for manual connections (auto-connect disabled on startup)");
}

void WiFiServiceESP::configureMemorySettings()
{
    // Configure WiFi memory settings for lower RAM usage
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();

    // Reduce memory allocations
    cfg.static_rx_buf_num = 4;  // Default is 10
    cfg.dynamic_rx_buf_num = 8; // Default is 32
    cfg.static_tx_buf_num = 4;  // Default is 6
    cfg.dynamic_tx_buf_num = 8; // Default is 32
    cfg.rx_ba_win = 4;          // Default is 6
    cfg.ampdu_rx_enable = 0;    // Disable AMPDU RX
    cfg.ampdu_tx_enable = 0;    // Disable AMPDU TX

    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
}

void WiFiServiceESP::initWiFi()
{
    if (wifi_initialized)
        return;

    // Register event handlers
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, this));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &ip_event_handler, this));

    // Set WiFi mode to station
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());

    wifi_initialized = true;
    Serial.println("WiFiServiceESP: WiFi initialized");
}

void WiFiServiceESP::wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    WiFiServiceESP *self = (WiFiServiceESP *)arg;
    if (!self)
        return;

    switch (event_id)
    {
    case WIFI_EVENT_STA_START:
        Serial.println("WiFiServiceESP: WiFi station started");
        break;

    case WIFI_EVENT_STA_CONNECTED:
        Serial.println("WiFiServiceESP: Connected to AP");
        self->connecting = false;
        // Reset reconnection attempts on successful connection
        self->reconnectAttempts = 0;
        break;

    case WIFI_EVENT_STA_DISCONNECTED:
    {
        Serial.println("WiFiServiceESP: Disconnected from AP");
        self->connecting = false;

        // If we were previously connected (not a connection failure), reset reconnect attempts
        // to allow immediate reconnection attempts
        if (self->reconnectAttempts == 0)
        {
            Serial.println("WiFiServiceESP: Unexpected disconnection, enabling auto-reconnect");
            self->lastReconnectAttempt = 0; // Allow immediate reconnect attempt
        }

        self->notifyConnectionState(false, "");
        break;
    }

    case WIFI_EVENT_SCAN_DONE:
        Serial.println("WiFiServiceESP: Scan completed");
        if (self->scanning)
        {
            self->handleScanComplete();
        }
        else
        {
            Serial.println("WiFiServiceESP: Received scan done event but not scanning");
        }
        break;

    default:
        break;
    }
}

void WiFiServiceESP::ip_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    WiFiServiceESP *self = (WiFiServiceESP *)arg;
    if (!self || event_id != IP_EVENT_STA_GOT_IP)
        return;

    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    Serial.printf("WiFiServiceESP: Got IP: " IPSTR "\n", IP2STR(&event->ip_info.ip));

    self->connecting = false;
    // Reset reconnection attempts on successful IP acquisition
    self->reconnectAttempts = 0;
    self->notifyConnectionState(true, self->getConnectedSSID());

    // Save credentials if connection successful
    if (!self->currentCredentials.ssid.isEmpty())
    {
        self->saveCredentials(self->currentCredentials.ssid, self->currentCredentials.password);
    }
}

void WiFiServiceESP::update()
{
    // Handle connection timeout
    if (connecting)
    {
        handleConnectionTimeout();
    }

    // Handle automatic WiFi reconnection
    if (autoReconnectEnabled && !connecting && !isConnected())
    {
        uint32_t currentTime = millis();

        // Check if it's time to attempt reconnection
        if (currentTime - lastReconnectAttempt >= reconnectInterval)
        {
            // Only attempt if we have saved credentials and haven't exceeded max attempts
            if (hasSavedCredentials() && reconnectAttempts < maxReconnectAttempts)
            {
                Serial.printf("WiFiServiceESP: Auto-reconnect attempt %d/%d\n",
                              reconnectAttempts + 1, maxReconnectAttempts);

                lastReconnectAttempt = currentTime;
                reconnectAttempts++;

                // Try auto-connect with saved credentials
                if (tryAutoConnect())
                {
                    Serial.println("WiFiServiceESP: Auto-reconnect initiated");
                }
                else
                {
                    Serial.println("WiFiServiceESP: Auto-reconnect failed to initiate");
                }
            }
            else if (reconnectAttempts >= maxReconnectAttempts)
            {
                // Only log this once every 5 minutes to avoid spam
                static uint32_t lastMaxAttemptsLog = 0;
                if (currentTime - lastMaxAttemptsLog > 300000) // 5 minutes
                {
                    lastMaxAttemptsLog = currentTime;
                    Serial.printf("WiFiServiceESP: Max reconnect attempts (%d) reached. Will retry after successful manual connection.\n",
                                  maxReconnectAttempts);
                }
            }
        }
    }
}

bool WiFiServiceESP::isConnected()
{
    wifi_ap_record_t ap_info;
    return esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK;
}

String WiFiServiceESP::getConnectedSSID()
{
    wifi_ap_record_t ap_info;
    if (esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK)
    {
        return String((char *)ap_info.ssid);
    }
    return "";
}

String WiFiServiceESP::getLocalIP()
{
    esp_netif_ip_info_t ip_info;
    if (esp_netif_get_ip_info(sta_netif, &ip_info) == ESP_OK)
    {
        char ip_str[16];
        snprintf(ip_str, sizeof(ip_str), IPSTR, IP2STR(&ip_info.ip));
        return String(ip_str);
    }
    return "";
}

void WiFiServiceESP::connectToNetwork(const String &ssid, const String &password)
{
    if (connecting)
    {
        Serial.println("WiFiServiceESP: Already connecting...");
        return;
    }

    // Disconnect from any existing connection first
    if (isConnected())
    {
        esp_wifi_disconnect();
    }

    currentCredentials.ssid = ssid;
    currentCredentials.password = password;
    connecting = true;
    connectionStartTime = millis();
    lastConnectionUpdate = 0;

    // Reset reconnection attempts on manual connection
    reconnectAttempts = 0;

    Serial.println("WiFiServiceESP: Connecting to " + ssid + "...");
    notifyScanProgress("Connecting to " + ssid + "...");

    // Create WiFi configuration
    wifi_config_t wifi_config = createWiFiConfig(ssid, password);

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_connect());
}

wifi_config_t WiFiServiceESP::createWiFiConfig(const String &ssid, const String &password)
{
    wifi_config_t wifi_config = {};

    // Copy SSID
    strncpy((char *)wifi_config.sta.ssid, ssid.c_str(), sizeof(wifi_config.sta.ssid) - 1);

    // Copy password if provided
    if (password.length() > 0)
    {
        strncpy((char *)wifi_config.sta.password, password.c_str(), sizeof(wifi_config.sta.password) - 1);
    }

    // Set threshold for weakest authmode to accept
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;
    wifi_config.sta.pmf_cfg.capable = true;
    wifi_config.sta.pmf_cfg.required = false;

    return wifi_config;
}

void WiFiServiceESP::disconnect()
{
    connecting = false;
    esp_wifi_disconnect();
    Serial.println("WiFiServiceESP: Disconnected");
    notifyConnectionState(false, "");
}

bool WiFiServiceESP::tryAutoConnect()
{
    String savedSSID, savedPassword;

    if (!loadSavedCredentials(savedSSID, savedPassword))
    {
        return false;
    }

    Serial.println("WiFiServiceESP: Attempting auto-connect to: " + savedSSID);
    connectToNetwork(savedSSID, savedPassword);
    return true;
}

void WiFiServiceESP::scanNetworks()
{
    if (scanning || connecting)
    {
        Serial.println("WiFiServiceESP: Scan already in progress or connecting - aborting");
        return;
    }

    scanning = true;
    networkCount = 0;
    Serial.println("WiFiServiceESP: Starting network scan...");
    notifyScanProgress("Scanning for networks...");

    wifi_scan_config_t scan_config = {};
    scan_config.ssid = NULL;
    scan_config.bssid = NULL;
    scan_config.channel = 0;
    scan_config.show_hidden = false;
    scan_config.scan_type = WIFI_SCAN_TYPE_ACTIVE;
    scan_config.scan_time.active.min = 100;
    scan_config.scan_time.active.max = 300;

    esp_err_t err = esp_wifi_scan_start(&scan_config, false);
    if (err != ESP_OK)
    {
        Serial.printf("WiFiServiceESP: Failed to start scan: %s\n", esp_err_to_name(err));
        scanning = false;
        notifyScanProgress("Scan start failed");
        return;
    }
}

void WiFiServiceESP::handleScanComplete()
{
    uint16_t scan_count = 0;
    esp_err_t err = esp_wifi_scan_get_ap_num(&scan_count);

    if (err != ESP_OK)
    {
        Serial.printf("WiFiServiceESP: Error getting scan count: %s\n", esp_err_to_name(err));
        scanning = false;
        notifyScanProgress("Scan failed");
        return;
    }

    if (scan_count == 0)
    {
        Serial.println("WiFiServiceESP: No networks found");
        scanning = false;
        notifyScanProgress("No networks found");
        return;
    }

    networkCount = min((int)scan_count, (int)MAX_WIFI_NETWORKS);
    Serial.printf("WiFiServiceESP: Found %d networks\n", networkCount);

    wifi_ap_record_t *ap_records = (wifi_ap_record_t *)malloc(scan_count * sizeof(wifi_ap_record_t));

    if (!ap_records)
    {
        Serial.println("WiFiServiceESP: Failed to allocate memory for scan results");
        scanning = false;
        notifyScanProgress("Memory error");
        return;
    }

    err = esp_wifi_scan_get_ap_records(&scan_count, ap_records);
    if (err != ESP_OK)
    {
        Serial.printf("WiFiServiceESP: Error getting scan records: %s\n", esp_err_to_name(err));
        free(ap_records);
        scanning = false;
        notifyScanProgress("Scan failed");
        return;
    }

    // Copy scan results to our network array with safety checks
    for (uint8_t i = 0; i < networkCount && i < MAX_WIFI_NETWORKS; i++)
    {
        // Skip empty SSIDs
        if (ap_records[i].ssid[0] == 0)
        {
            Serial.printf("WiFiServiceESP: Skipping network %d with empty SSID\n", i);
            continue;
        }

        // Ensure SSID is null-terminated by copying to a buffer
        char ssid_str[33] = {0}; // WiFi SSID max is 32 bytes + null terminator
        // Copy up to 32 bytes (SSID length might not be null-terminated)
        size_t ssid_len = strnlen((char *)ap_records[i].ssid, 32);
        if (ssid_len > 0)
        {
            memcpy(ssid_str, ap_records[i].ssid, ssid_len);
            ssid_str[ssid_len] = '\0'; // Ensure null termination

            availableNetworks[i].ssid = String(ssid_str);
            availableNetworks[i].rssi = ap_records[i].rssi;
            availableNetworks[i].encryptionType = ap_records[i].authmode;
            availableNetworks[i].isOpen = (ap_records[i].authmode == WIFI_AUTH_OPEN);
            availableNetworks[i].channel = ap_records[i].primary;

            Serial.printf("WiFiServiceESP: Network %d: %s (RSSI: %d)\n", i, ssid_str, ap_records[i].rssi);
        }
    }

    free(ap_records);
    scanning = false;
    notifyScanProgress("Scan complete");

    // Notify subscribers with safety check
    if (scanCompleteCallback && networkCount > 0)
    {
        Serial.printf("WiFiServiceESP: Calling scan complete callback with %d networks\n", networkCount);
        // Add a small delay to ensure stack is stable
        delay(10);
        scanCompleteCallback(availableNetworks, networkCount);
    }
    else if (scanCompleteCallback && networkCount == 0)
    {
        Serial.println("WiFiServiceESP: Callback registered but no networks found");
        scanCompleteCallback(availableNetworks, 0);
    }
    else
    {
        Serial.println("WiFiServiceESP: No scan complete callback registered!");
    }
}

void WiFiServiceESP::handleConnectionTimeout()
{
    uint32_t currentTime = millis();
    if (currentTime - connectionStartTime > 15000)
    { // 15 second timeout
        Serial.println("WiFiServiceESP: Connection timeout - stopping connection attempt");
        connecting = false;
        esp_wifi_disconnect();

        notifyScanProgress("Connection timeout");
        notifyConnectionState(false, currentCredentials.ssid);

        // Clear credentials to prevent auto-retry
        currentCredentials.ssid = "";
        currentCredentials.password = "";
    }
    else
    {
        // Update connecting status with animation
        uint32_t elapsed = (currentTime - connectionStartTime) / 1000;
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

// HTTP client methods removed to avoid conflicts with ESPAsyncWebServer

// Credential management (same as original WiFiServiceESP)
void WiFiServiceESP::saveCredentials(const String &ssid, const String &password)
{
    Serial.println("WiFiServiceESP: Saving credentials for " + ssid);

    if (preferences.begin("wifi_creds", false))
    {
        preferences.putString("ssid", ssid);
        preferences.putString("password", password);
        preferences.putBool("has_creds", true);
        preferences.end();
        Serial.println("WiFiServiceESP: Credentials saved successfully");
    }
    else
    {
        Serial.println("WiFiServiceESP: Failed to save credentials");
    }
}

bool WiFiServiceESP::loadSavedCredentials(String &ssid, String &password)
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
                Serial.println("WiFiServiceESP: Loaded credentials for: " + ssid);
                return true;
            }
        }
        preferences.end();
    }

    return false;
}

void WiFiServiceESP::clearSavedCredentials()
{
    Serial.println("WiFiServiceESP: Clearing saved credentials...");

    if (preferences.begin("wifi_creds", false))
    {
        preferences.clear();
        preferences.end();
        Serial.println("WiFiServiceESP: Credentials cleared");
    }
}

bool WiFiServiceESP::hasSavedCredentials()
{
    if (preferences.begin("wifi_creds", true))
    {
        bool hasCreds = preferences.getBool("has_creds", false);
        preferences.end();
        return hasCreds;
    }
    return false;
}

void WiFiServiceESP::notifyConnectionState(bool connected, const String &ssid)
{
    if (connectionCallback)
    {
        Serial.printf("WiFiServiceESP: Notifying connection state - connected=%d, ssid=%s\n", connected, ssid.c_str());
        connectionCallback(connected, ssid);
    }
}

void WiFiServiceESP::notifyScanProgress(const String &status)
{
    if (scanProgressCallback)
    {
        scanProgressCallback(status);
    }
}

String WiFiServiceESP::getEncryptionTypeString(wifi_auth_mode_t encType)
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

int WiFiServiceESP::getSignalStrength(int32_t rssi)
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