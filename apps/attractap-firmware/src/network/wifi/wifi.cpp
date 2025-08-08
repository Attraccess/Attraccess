#include "wifi.hpp"

State Wifi::appState;
bool Wifi::is_setup = false;
esp_netif_t *Wifi::wifi_interface = NULL;
Logger Wifi::logger("WiFi");

Wifi::WifiState Wifi::_state = WIFI_STATE_INIT;
String Wifi::_lastSSID;

uint8_t Wifi::current_reconnect_attempts_count = 0;
uint32_t Wifi::last_reconnect_attempt_time_ms = 0;
const uint32_t Wifi::RECONNECT_INTERVAL_MS = 10000;
const uint32_t Wifi::MAX_RECONNECT_ATTEMPTS = 10;

bool Wifi::is_scanning = false;
Wifi::WifiNetwork Wifi::knownWifiNetworks[MAX_KNOWN_WIFI_NETWORKS];
uint8_t Wifi::knownWifiNetworksCount = 0;

void Wifi::setup()
{
    logger.info("initializing");

    if (is_setup)
    {
        logger.info("Already initialized");
        return;
    }

    logger.info("creating default wifi station interface");

    wifi_interface = esp_netif_create_default_wifi_sta();
    if (wifi_interface == NULL)
    {
        logger.error("Failed to create WiFi station interface");
        return;
    }

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

    esp_err_t wifi_init_result = esp_wifi_init(&cfg);
    if (wifi_init_result != ESP_OK)
    {
        logger.error((String("Failed to initialize WiFi: ") + esp_err_to_name(wifi_init_result)).c_str());
        return;
    }

    // Register event handlers
    esp_err_t wifi_event_handler_result = esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifiEventHandler, NULL);
    if (wifi_event_handler_result != ESP_OK)
    {
        logger.error((String("Failed to register WiFi event handler: ") + esp_err_to_name(wifi_event_handler_result)).c_str());
        return;
    }

    esp_err_t ip_event_handler_result = esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &ipEventHandler, NULL);
    if (ip_event_handler_result != ESP_OK)
    {
        logger.error((String("Failed to register IP event handler: ") + esp_err_to_name(ip_event_handler_result)).c_str());
        return;
    }

    // Set WiFi mode to station
    esp_err_t wifi_set_mode_result = esp_wifi_set_mode(WIFI_MODE_STA);
    if (wifi_set_mode_result != ESP_OK)
    {
        logger.error((String("Failed to set WiFi mode: ") + esp_err_to_name(wifi_set_mode_result)).c_str());
        return;
    }

    esp_err_t wifi_start_result = esp_wifi_start();
    if (wifi_start_result != ESP_OK)
    {
        logger.error((String("Failed to start WiFi: ") + esp_err_to_name(wifi_start_result)).c_str());
        return;
    }

    BaseType_t taskResult = xTaskCreate(
        taskFn,
        "Wifi",
        8192, // Increased stack size to 8192 to prevent stack overflow
        NULL,
        TASK_PRIORITY_WIFI,
        NULL);

    if (taskResult != pdPASS)
    {
        logger.error(("Failed to create WiFi task: " + String(taskResult)).c_str());
        return;
    }

    logger.info("WiFi task created successfully");
    is_setup = true;
}

void Wifi::wifiEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    switch (event_id)
    {
    case WIFI_EVENT_STA_START:
        logger.info("WiFi station started");
        break;

    case WIFI_EVENT_STA_CONNECTED:
        logger.info("Connected to AP");

        if (_state != WIFI_STATE_CONNECTED)
        {
            setState(WIFI_STATE_CONNECTED_WAITING_FOR_IP);
        }
        // Reset reconnection attempts on successful connection
        current_reconnect_attempts_count = 0;
        break;

    case WIFI_EVENT_STA_DISCONNECTED:
    {
        logger.info("Disconnected from AP");
        setState(WIFI_STATE_DISCONNECTED);

        // If we were previously connected (not a connection failure), reset reconnect attempts
        // to allow immediate reconnection attempts
        if (current_reconnect_attempts_count == 0)
        {
            logger.info("Unexpected disconnection, enabling auto-reconnect");
            current_reconnect_attempts_count = 0; // Allow immediate reconnect attempt
        }
        break;
    }

    case WIFI_EVENT_SCAN_DONE:
        logger.info("Scan completed");
        handleScanComplete();
        break;

    default:
        break;
    }
}

void Wifi::ipEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;

    char wifi_ip_str[16];
    snprintf(wifi_ip_str, sizeof(wifi_ip_str), IPSTR, IP2STR(&event->ip_info.ip));
    logger.info(("Got IP: " + String(wifi_ip_str)).c_str());

    setState(WIFI_STATE_CONNECTED);
    // Reset reconnection attempts on successful IP acquisition
    current_reconnect_attempts_count = 0;
}

void Wifi::setState(WifiState state)
{
    _state = state;
    appState.setWifiState(state == WIFI_STATE_CONNECTED, Wifi::getIPAddress(), _lastSSID);

    logger.debug(("setState called with state: " + String(state)).c_str());
}

void Wifi::taskFn(void *parameter)
{
    logger.info("WiFi task started and running");

    while (true)
    {
        Wifi::loop();
        vTaskDelay(pdMS_TO_TICKS(100)); // Use FreeRTOS delay instead of Arduino delay
    }
}
void Wifi::loop()
{
    // Add periodic debug logging
    static uint32_t lastLoopLog = 0;
    uint32_t currentTime = millis();
    if (currentTime - lastLoopLog > 10000) // Every 10 seconds
    {
        lastLoopLog = currentTime;
        logger.debug(("Loop - current state: " + String(_state)).c_str());
    }

    // Yield to other tasks at the start of each loop iteration
    vTaskDelay(1);

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

    default:
        logger.error(("Unknown state: " + String(_state)).c_str());
        break;
    }
}

void Wifi::ensureConnection()
{
    if (isConnected())
    {
        logger.info("Already connected");
        return;
    }

    uint32_t currentTime = millis();
    if (!hasSavedCredentials())
    {
        static uint32_t lastNoSavedCredentialsLog = 0;
        if (currentTime - lastNoSavedCredentialsLog > 10000) // 10 seconds
        {
            lastNoSavedCredentialsLog = currentTime;
            logger.info("No saved credentials found, cannot auto-connect");
        }
        return;
    }

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
            logger.info(("Max reconnect attempts (" + String(MAX_RECONNECT_ATTEMPTS) + ") reached. Will retry after successful manual connection.").c_str());
        }
        return;
    }

    last_reconnect_attempt_time_ms = currentTime;
    current_reconnect_attempts_count++;

    tryAutoConnect();
}

void Wifi::tryAutoConnect()
{
    logger.info(("Auto-reconnect attempt " + String(current_reconnect_attempts_count) + "/" + String(MAX_RECONNECT_ATTEMPTS)).c_str());

    if (!hasSavedCredentials())
    {
        logger.info("No saved credentials found, cannot auto-connect");
        return;
    }

    String savedSSID = Settings::getNetworkConfig().ssid;
    String savedPassword = Settings::getNetworkConfig().password;

    logger.info(("Attempting auto-connect to: " + savedSSID).c_str());
    connectToNetwork(savedSSID, savedPassword);
}

bool Wifi::hasSavedCredentials()
{
    return Settings::getNetworkConfig().ssid.length() > 0;
}

void Wifi::connectToNetwork(const String &ssid, const String &password)
{
    logger.info(("connectToNetwork called for SSID: " + ssid).c_str());

    _lastSSID = ssid;

    logger.debug("Step 1: Checking if already connected");
    // Disconnect from any existing connection first
    if (isConnected())
    {
        logger.info("Disconnecting from existing connection");
        esp_wifi_disconnect();
    }

    logger.debug("Step 2: Setting state to connecting");
    setState(WIFI_STATE_CONNECTING);

    logger.debug("Step 3: Creating WiFi configuration");

    // Create WiFi configuration
    wifi_config_t wifi_config = {};

    logger.debug("Step 4: Copying SSID");
    // Copy SSID
    strncpy((char *)wifi_config.sta.ssid, ssid.c_str(), sizeof(wifi_config.sta.ssid) - 1);
    vTaskDelay(1); // Yield to prevent watchdog

    logger.debug("Step 5: Copying password");
    // Copy password if provided
    if (password.length() > 0)
    {
        strncpy((char *)wifi_config.sta.password, password.c_str(), sizeof(wifi_config.sta.password) - 1);
    }
    vTaskDelay(1); // Yield to prevent watchdog

    logger.debug("Step 6: Setting WiFi configuration options");

    // Set threshold for weakest authmode to accept (more permissive)
    wifi_config.sta.threshold.authmode = WIFI_AUTH_OPEN;
    wifi_config.sta.pmf_cfg.capable = true;
    wifi_config.sta.pmf_cfg.required = false;

    // Set scan method to be more reliable
    wifi_config.sta.scan_method = WIFI_FAST_SCAN;
    wifi_config.sta.sort_method = WIFI_CONNECT_AP_BY_SIGNAL;
    wifi_config.sta.failure_retry_cnt = 3;
    vTaskDelay(1); // Yield to prevent watchdog

    logger.debug("Step 7: Setting WiFi config and initiating connection");

    esp_err_t wifi_set_config_result = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    if (wifi_set_config_result != ESP_OK)
    {
        logger.error((String("Failed to set WiFi config: ") + esp_err_to_name(wifi_set_config_result)).c_str());
        setState(WIFI_STATE_CONNECT_FAILED);
        return;
    }

    logger.info("WiFi config set successfully");

    // Give WiFi stack time to process the config before connecting
    vTaskDelay(pdMS_TO_TICKS(100));

    logger.debug("calling esp_wifi_connect");

    // Make the WiFi connect call
    logger.debug("About to call esp_wifi_connect...");

    esp_err_t wifi_connect_result = esp_wifi_connect();

    logger.debug((String("esp_wifi_connect returned: ") + esp_err_to_name(wifi_connect_result)).c_str());

    if (wifi_connect_result != ESP_OK)
    {
        logger.error((String("Failed to start WiFi connection: ") + esp_err_to_name(wifi_connect_result)).c_str());
        setState(WIFI_STATE_CONNECT_FAILED);
        return;
    }

    // Don't reset the attempt counter here - it should only be reset on successful connection
    last_reconnect_attempt_time_ms = millis();
    logger.debug(("Connection attempt started at " + String(last_reconnect_attempt_time_ms) + " ms").c_str());
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

esp_ip4_addr_t Wifi::getIPAddress()
{
    esp_netif_ip_info_t ip_info;
    esp_netif_get_ip_info(wifi_interface, &ip_info);
    return ip_info.ip;
}

void Wifi::startScan()
{
    if (is_scanning)
    {
        return;
    }

    logger.info("starting wifi scan");
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
        logger.error((String("Failed to start scan: ") + esp_err_to_name(err)).c_str());
        Wifi::is_scanning = false;
    }
    logger.info("wifi scan started");
}

bool Wifi::isScanning()
{
    return is_scanning;
}

void Wifi::handleScanComplete()
{
    logger.info("handling scan complete");
    uint16_t scan_count = 0;
    esp_err_t err = esp_wifi_scan_get_ap_num(&scan_count);

    if (err != ESP_OK)
    {
        logger.error((String("Error getting scan count: ") + esp_err_to_name(err)).c_str());
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    if (scan_count == 0)
    {
        logger.info("No networks found");
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    knownWifiNetworksCount = min((int)scan_count, (int)MAX_KNOWN_WIFI_NETWORKS);
    logger.info(("Found " + String(knownWifiNetworksCount) + " networks").c_str());

    wifi_ap_record_t *ap_records = (wifi_ap_record_t *)malloc(scan_count * sizeof(wifi_ap_record_t));

    if (!ap_records)
    {
        logger.error("Failed to allocate memory for scan results");
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    logger.debug("calling esp_wifi_scan_get_ap_records");
    err = esp_wifi_scan_get_ap_records(&scan_count, ap_records);
    if (err != ESP_OK)
    {
        logger.error((String("Error getting scan records: ") + esp_err_to_name(err)).c_str());
        free(ap_records);
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    // Copy scan results to our network array with safety checks
    logger.debug("copying scan results to our network array");
    for (uint8_t i = 0; i < knownWifiNetworksCount && i < MAX_KNOWN_WIFI_NETWORKS; i++)
    {
        // Skip empty SSIDs
        if (ap_records[i].ssid[0] == 0)
        {
            logger.debug(("Skipping network " + String(i) + " with empty SSID").c_str());
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

            logger.debug(("Network " + String(i) + ": " + String(ssid_str) + " (RSSI: " + String(ap_records[i].rssi) + ")").c_str());
        }
    }

    free(ap_records);
    Wifi::is_scanning = false;

    logger.info("wifi scan complete and done");
}

void Wifi::handleTimeout()
{
    if (isConnected())
    {
        return;
    }

    uint32_t currentTime = millis();
    uint32_t elapsed = currentTime - last_reconnect_attempt_time_ms;

    // Add debug logging every 5 seconds
    static uint32_t lastTimeoutLog = 0;
    if (currentTime - lastTimeoutLog > 5000)
    {
        lastTimeoutLog = currentTime;
        logger.debug(("Connection timeout check - elapsed: " + String(elapsed) + " ms (max: 15000 ms), state: " + String(_state)).c_str());
    }

    if (elapsed > 15000)
    { // 15 second timeout
        logger.info("Connection timeout - stopping connection attempt");
        esp_wifi_disconnect();
        setState(WIFI_STATE_CONNECT_FAILED);
        return;
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