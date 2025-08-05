#include "wifi.hpp"

bool Wifi::is_setup = false;
bool Wifi::is_scanning = false;
uint8_t Wifi::current_reconnect_attempts_count = 0;
uint32_t Wifi::last_reconnect_attempt_time_ms = 0;
const uint32_t Wifi::RECONNECT_INTERVAL_MS = 10000;
const uint32_t Wifi::MAX_RECONNECT_ATTEMPTS = 10;
esp_netif_t *Wifi::wifi_interface = NULL;
void (*Wifi::onStateChangedCallback)(WifiState state, const String &ssid) = NULL;
void (*Wifi::onScanComplete)(WifiNetwork *networks, uint8_t count) = NULL;
Wifi::WifiState Wifi::_state = WIFI_STATE_INIT;
Wifi::WifiNetwork Wifi::knownWifiNetworks[MAX_KNOWN_WIFI_NETWORKS];
uint8_t Wifi::knownWifiNetworksCount = 0;

void Wifi::taskFn(void *parameter)
{
    while (true)
    {
        Wifi::loop();
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void Wifi::setup()
{
    if (is_setup)
    {
        return;
    }

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    wifi_interface = esp_netif_create_default_wifi_sta();

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

    // Register event handlers
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifiEventHandler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &ipEventHandler, NULL));

    // Set WiFi mode to station
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_start());

    xTaskCreate(
        taskFn,
        "Wifi",
        10000,
        NULL,
        10,
        NULL);

    is_setup = true;
}

void Wifi::wifiEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    switch (event_id)
    {
    case WIFI_EVENT_STA_START:
        Serial.println("WiFiServiceESP: WiFi station started");
        break;

    case WIFI_EVENT_STA_CONNECTED:
        Serial.println("WiFiServiceESP: Connected to AP");

        if (_state != WIFI_STATE_CONNECTED)
        {
            setState(WIFI_STATE_CONNECTED_WAITING_FOR_IP);
        }
        // Reset reconnection attempts on successful connection
        current_reconnect_attempts_count = 0;
        break;

    case WIFI_EVENT_STA_DISCONNECTED:
    {
        Serial.println("WiFiServiceESP: Disconnected from AP");
        setState(WIFI_STATE_DISCONNECTED);

        // If we were previously connected (not a connection failure), reset reconnect attempts
        // to allow immediate reconnection attempts
        if (current_reconnect_attempts_count == 0)
        {
            Serial.println("WiFiServiceESP: Unexpected disconnection, enabling auto-reconnect");
            current_reconnect_attempts_count = 0; // Allow immediate reconnect attempt
        }
        break;
    }

    case WIFI_EVENT_SCAN_DONE:
        Serial.println("WiFiServiceESP: Scan completed");
        handleScanComplete();
        break;

    default:
        break;
    }
}

void Wifi::setStateChangedCallback(void (*callback)(WifiState state, const String &ssid))
{
    onStateChangedCallback = callback;
}

void Wifi::setScanCompleteCallback(void (*callback)(WifiNetwork *networks, uint8_t count))
{
    onScanComplete = callback;
}

void Wifi::ipEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    Serial.printf("Network: Got IP: " IPSTR "\n", IP2STR(&event->ip_info.ip));

    setState(WIFI_STATE_CONNECTED);
    // Reset reconnection attempts on successful IP acquisition
    current_reconnect_attempts_count = 0;
}

void Wifi::setState(WifiState state)
{
    _state = state;

    if (onStateChangedCallback)
    {
        onStateChangedCallback(state, Settings::getNetworkConfig().ssid);
    }
}

void Wifi::loop()
{
    switch (_state)
    {
    case WIFI_STATE_INIT:
        ensureConnection();
        break;

    case WIFI_STATE_CONNECTING:
        handleTimeout();
        break;

    case WIFI_STATE_CONNECTED_WAITING_FOR_IP:
        handleTimeout();
        break;

    case WIFI_STATE_CONNECTED:
        break;

    case WIFI_STATE_DISCONNECTED:
        ensureConnection();
        break;

    case WIFI_STATE_CONNECT_FAILED:
        ensureConnection();
        break;
    }
}

void Wifi::ensureConnection()
{
    if (isConnected())
    {
        Serial.println("WiFiServiceESP: Already connected");
        return;
    }

    if (!hasSavedCredentials())
    {
        Serial.println("WiFiServiceESP: No saved credentials found, cannot auto-connect");
        return;
    }

    uint32_t currentTime = millis();

    // Check if it's time to attempt reconnection
    bool shouldAttemptReconnect = currentTime - last_reconnect_attempt_time_ms >= RECONNECT_INTERVAL_MS;

    if (!shouldAttemptReconnect)
    {
        return;
    }

    if (current_reconnect_attempts_count >= MAX_RECONNECT_ATTEMPTS)
    {
        // Only log this once every 5 minutes to avoid spam
        static uint32_t lastMaxAttemptsLog = 0;
        if (currentTime - lastMaxAttemptsLog > 10000) // 10 seconds
        {
            lastMaxAttemptsLog = currentTime;
            Serial.printf("WiFiServiceESP: Max reconnect attempts (%d) reached. Will retry after successful manual connection.\n",
                          MAX_RECONNECT_ATTEMPTS);
        }
        return;
    }

    last_reconnect_attempt_time_ms = currentTime;
    current_reconnect_attempts_count++;

    tryAutoConnect();
}

void Wifi::tryAutoConnect()
{
    Serial.printf("WiFiServiceESP: Auto-reconnect attempt %d/%d\n",
                  current_reconnect_attempts_count + 1, MAX_RECONNECT_ATTEMPTS);

    if (!hasSavedCredentials())
    {
        Serial.println("WiFiServiceESP: No saved credentials found, cannot auto-connect");
        return;
    }

    String savedSSID = Settings::getNetworkConfig().ssid;
    String savedPassword = Settings::getNetworkConfig().password;

    Serial.println("WiFiServiceESP: Attempting auto-connect to: " + savedSSID);
    connectToNetwork(savedSSID, savedPassword);
}

bool Wifi::hasSavedCredentials()
{
    return Settings::getNetworkConfig().ssid.length() > 0;
}

void Wifi::connectToNetwork(const String &ssid, const String &password)
{
    // Disconnect from any existing connection first
    if (isConnected())
    {
        esp_wifi_disconnect();
    }

    setState(WIFI_STATE_CONNECTING);

    // Create WiFi configuration
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

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_connect());

    current_reconnect_attempts_count = 0;
    last_reconnect_attempt_time_ms = millis();
}

bool Wifi::isConnected()
{
    wifi_ap_record_t ap_info;
    return esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK;
}

Wifi::WifiState Wifi::getState()
{
    return _state;
}

IPAddress Wifi::getIPAddress()
{
    esp_netif_ip_info_t ip_info;
    esp_netif_get_ip_info(wifi_interface, &ip_info);
    return IPAddress(ip_info.ip.addr);
}

void Wifi::startScan()
{
    if (is_scanning)
    {
        return;
    }

    Wifi::is_scanning = true;

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
        Wifi::is_scanning = false;
    }
}

bool Wifi::isScanning()
{
    return is_scanning;
}

void Wifi::handleScanComplete()
{
    uint16_t scan_count = 0;
    esp_err_t err = esp_wifi_scan_get_ap_num(&scan_count);

    if (err != ESP_OK)
    {
        Serial.printf("WiFiServiceESP: Error getting scan count: %s\n", esp_err_to_name(err));
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    if (scan_count == 0)
    {
        Serial.println("WiFiServiceESP: No networks found");
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    knownWifiNetworksCount = min((int)scan_count, (int)MAX_KNOWN_WIFI_NETWORKS);
    Serial.printf("WiFiServiceESP: Found %d networks\n", knownWifiNetworksCount);

    wifi_ap_record_t *ap_records = (wifi_ap_record_t *)malloc(scan_count * sizeof(wifi_ap_record_t));

    if (!ap_records)
    {
        Serial.println("WiFiServiceESP: Failed to allocate memory for scan results");
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    err = esp_wifi_scan_get_ap_records(&scan_count, ap_records);
    if (err != ESP_OK)
    {
        Serial.printf("WiFiServiceESP: Error getting scan records: %s\n", esp_err_to_name(err));
        free(ap_records);
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    // Copy scan results to our network array with safety checks
    for (uint8_t i = 0; i < knownWifiNetworksCount && i < MAX_KNOWN_WIFI_NETWORKS; i++)
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

            knownWifiNetworks[i].ssid = String(ssid_str);
            knownWifiNetworks[i].rssi = ap_records[i].rssi;
            knownWifiNetworks[i].encryptionType = ap_records[i].authmode;
            knownWifiNetworks[i].isOpen = (ap_records[i].authmode == WIFI_AUTH_OPEN);
            knownWifiNetworks[i].channel = ap_records[i].primary;

            Serial.printf("WiFiServiceESP: Network %d: %s (RSSI: %d)\n", i, ssid_str, ap_records[i].rssi);
        }
    }

    free(ap_records);
    Wifi::is_scanning = false;

    if (onScanComplete)
    {
        onScanComplete(knownWifiNetworks, knownWifiNetworksCount);
    }
}

void Wifi::handleTimeout()
{
    if (isConnected())
    {
        return;
    }

    uint32_t currentTime = millis();
    if (currentTime - last_reconnect_attempt_time_ms > 15000)
    { // 15 second timeout
        Serial.println("WiFiServiceESP: Connection timeout - stopping connection attempt");
        esp_wifi_disconnect();
        setState(WIFI_STATE_DISCONNECTED);
        return;
    }

    // Update connecting status with animation
    uint32_t elapsed = (currentTime - last_reconnect_attempt_time_ms) / 1000;
    if (elapsed != last_reconnect_attempt_time_ms)
    {
        last_reconnect_attempt_time_ms = elapsed;
        String dots = "";
        for (int i = 0; i < (elapsed % 4); i++)
        {
            dots += ".";
        }
        Serial.println("Connecting" + dots);
    }
}

Wifi::WifiScanResult Wifi::getKnownWifiNetworks()
{
    Wifi::WifiScanResult result;
    result.count = knownWifiNetworksCount;

    // Copy each network from knownWifiNetworks to result.networks
    for (uint8_t i = 0; i < knownWifiNetworksCount && i < MAX_KNOWN_WIFI_NETWORKS; i++)
    {
        result.networks[i] = knownWifiNetworks[i];
    }

    return result;
}