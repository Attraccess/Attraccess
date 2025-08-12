#include "wifi.hpp"

bool Wifi::is_setup = false;
esp_netif_t *Wifi::wifi_interface = NULL;
Logger Wifi::logger("WiFi");

Wifi::WifiState Wifi::_state = WIFI_STATE_INIT;
String Wifi::_lastSSID;

uint8_t Wifi::current_reconnect_attempts_count = 0;
uint32_t Wifi::last_reconnect_attempt_time_ms = 0;
const uint32_t Wifi::RECONNECT_INTERVAL_MS = 10000;

bool Wifi::is_scanning = false;
Wifi::WifiNetwork Wifi::knownWifiNetworks[MAX_KNOWN_WIFI_NETWORKS];
uint8_t Wifi::knownWifiNetworksCount = 0;

static String formatMac(const uint8_t *mac)
{
    char buf[18];
    snprintf(buf, sizeof(buf), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    return String(buf);
}

const char *Wifi::getStateName(WifiState state)
{
    switch (state)
    {
    case WIFI_STATE_INIT:
        return "INIT";
    case WIFI_STATE_CONNECTING:
        return "CONNECTING";
    case WIFI_STATE_CONNECTED_WAITING_FOR_IP:
        return "CONNECTED_WAITING_FOR_IP";
    case WIFI_STATE_CONNECTED:
        return "CONNECTED";
    case WIFI_STATE_DISCONNECTED:
        return "DISCONNECTED";
    case WIFI_STATE_CONNECT_FAILED:
        return "CONNECT_FAILED";
    default:
        return "UNKNOWN";
    }
}

const char *Wifi::getDisconnectReasonName(uint8_t reasonCode)
{
    switch (reasonCode)
    {
    case WIFI_REASON_UNSPECIFIED:
        return "UNSPECIFIED";
    case WIFI_REASON_AUTH_EXPIRE:
        return "AUTH_EXPIRE";
    case WIFI_REASON_AUTH_LEAVE:
        return "AUTH_LEAVE";
    case WIFI_REASON_ASSOC_EXPIRE:
        return "ASSOC_EXPIRE";
    case WIFI_REASON_ASSOC_TOOMANY:
        return "ASSOC_TOOMANY";
    case WIFI_REASON_NOT_AUTHED:
        return "NOT_AUTHED";
    case WIFI_REASON_NOT_ASSOCED:
        return "NOT_ASSOCED";
    case WIFI_REASON_ASSOC_LEAVE:
        return "ASSOC_LEAVE";
    case WIFI_REASON_ASSOC_NOT_AUTHED:
        return "ASSOC_NOT_AUTHED";
    case WIFI_REASON_DISASSOC_PWRCAP_BAD:
        return "DISASSOC_PWRCAP_BAD";
    case WIFI_REASON_DISASSOC_SUPCHAN_BAD:
        return "DISASSOC_SUPCHAN_BAD";
    case WIFI_REASON_IE_INVALID:
        return "IE_INVALID";
    case WIFI_REASON_MIC_FAILURE:
        return "MIC_FAILURE";
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
        return "4WAY_HANDSHAKE_TIMEOUT";
    case WIFI_REASON_GROUP_KEY_UPDATE_TIMEOUT:
        return "GROUP_KEY_UPDATE_TIMEOUT";
    case WIFI_REASON_IE_IN_4WAY_DIFFERS:
        return "IE_IN_4WAY_DIFFERS";
    case WIFI_REASON_GROUP_CIPHER_INVALID:
        return "GROUP_CIPHER_INVALID";
    case WIFI_REASON_PAIRWISE_CIPHER_INVALID:
        return "PAIRWISE_CIPHER_INVALID";
    case WIFI_REASON_AKMP_INVALID:
        return "AKMP_INVALID";
    case WIFI_REASON_UNSUPP_RSN_IE_VERSION:
        return "UNSUPP_RSN_IE_VERSION";
    case WIFI_REASON_INVALID_RSN_IE_CAP:
        return "INVALID_RSN_IE_CAP";
    case WIFI_REASON_802_1X_AUTH_FAILED:
        return "802_1X_AUTH_FAILED";
    case WIFI_REASON_CIPHER_SUITE_REJECTED:
        return "CIPHER_SUITE_REJECTED";
    case WIFI_REASON_BEACON_TIMEOUT:
        return "BEACON_TIMEOUT";
    case WIFI_REASON_NO_AP_FOUND:
        return "NO_AP_FOUND";
    case WIFI_REASON_AUTH_FAIL:
        return "AUTH_FAIL";
    case WIFI_REASON_ASSOC_FAIL:
        return "ASSOC_FAIL";
    case WIFI_REASON_HANDSHAKE_TIMEOUT:
        return "HANDSHAKE_TIMEOUT";
    default:
        return "UNKNOWN";
    }
}

void Wifi::setup()
{
    logger.info("Initializing WiFi");

    if (is_setup)
    {
        logger.info("Already initialized");
        return;
    }

    wifi_interface = esp_netif_create_default_wifi_sta();
    if (wifi_interface == NULL)
    {
        logger.error("Failed to create WiFi station interface");
        return;
    }

    String hostname = Settings::getHostname() + "-wifi";
    esp_netif_set_hostname(wifi_interface, hostname.c_str());
    logger.infof("Hostname set to %s", hostname.c_str());

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
        8192,
        NULL,
        TASK_PRIORITY_WIFI,
        NULL);

    if (taskResult != pdPASS)
    {
        logger.error(("Failed to create WiFi task: " + String(taskResult)).c_str());
        return;
    }

    logger.debug("WiFi task created successfully");
    is_setup = true;
}

void Wifi::wifiEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    switch (event_id)
    {
    case WIFI_EVENT_STA_START:
        logger.debug("STA start");
        break;

    case WIFI_EVENT_STA_CONNECTED:
    {
        auto *ev = (wifi_event_sta_connected_t *)event_data;
        String ssid = String(reinterpret_cast<const char *>(ev->ssid), ev->ssid_len);
        logger.infof("Associated with SSID '%s' BSSID %s on channel %d", ssid.c_str(), formatMac(ev->bssid).c_str(), ev->channel);

        if (_state != WIFI_STATE_CONNECTED)
        {
            setState(WIFI_STATE_CONNECTED_WAITING_FOR_IP);
        }
        // Reset reconnection attempts on successful connection
        current_reconnect_attempts_count = 0;
        break;
    }

    case WIFI_EVENT_STA_DISCONNECTED:
    {
        auto *ev = (wifi_event_sta_disconnected_t *)event_data;
        logger.infof("Disconnected: reason %u (%s)", ev->reason, getDisconnectReasonName(ev->reason));
        setState(WIFI_STATE_DISCONNECTED);
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

    char ip[16], mask[16], gw[16];
    snprintf(ip, sizeof(ip), IPSTR, IP2STR(&event->ip_info.ip));
    snprintf(mask, sizeof(mask), IPSTR, IP2STR(&event->ip_info.netmask));
    snprintf(gw, sizeof(gw), IPSTR, IP2STR(&event->ip_info.gw));
    logger.infof("Got IP %s, mask %s, gw %s", ip, mask, gw);

    setState(WIFI_STATE_CONNECTED);
    // Reset reconnection attempts on successful IP acquisition
    current_reconnect_attempts_count = 0;
}

void Wifi::setState(WifiState state)
{
    WifiState previous = _state;
    _state = state;
    State::setWifiState(state == WIFI_STATE_CONNECTED, Wifi::getIPAddress(), _lastSSID);
    if (previous != state)
    {
        logger.infof("State: %s -> %s", getStateName(previous), getStateName(state));
    }
}

void Wifi::taskFn(void *parameter)
{
    logger.debug("WiFi task started");

    while (true)
    {
        Wifi::loop();
        vTaskDelay(pdMS_TO_TICKS(100)); // Use FreeRTOS delay instead of Arduino delay
    }
}
void Wifi::loop()
{
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
        logger.error("Unknown WiFi state");
        break;
    }
}

void Wifi::ensureConnection()
{
    if (isConnected())
    {
        return;
    }

    uint32_t currentTime = millis();
    if (!hasSavedCredentials())
    {
        static bool warned = false;
        if (!warned)
        {
            logger.info("No saved WiFi credentials");
            warned = true;
        }
        return;
    }

    // Check if it's time to attempt reconnection
    bool shouldAttemptReconnect = currentTime - last_reconnect_attempt_time_ms >= RECONNECT_INTERVAL_MS;

    if (!shouldAttemptReconnect)
    {
        return;
    }

    last_reconnect_attempt_time_ms = currentTime;
    current_reconnect_attempts_count++;

    tryAutoConnect();
}

void Wifi::tryAutoConnect()
{
    if (!hasSavedCredentials())
    {
        return;
    }

    String savedSSID = Settings::getNetworkConfig().ssid;
    String savedPassword = Settings::getNetworkConfig().password;

    logger.infof("Reconnect attempt #%u to '%s'", current_reconnect_attempts_count, savedSSID.c_str());
    connectToNetwork(savedSSID, savedPassword);
}

bool Wifi::hasSavedCredentials()
{
    return Settings::getNetworkConfig().ssid.length() > 0;
}

void Wifi::connectToNetwork(const String &ssid, const String &password)
{
    logger.infof("Connecting to SSID '%s'", ssid.c_str());

    _lastSSID = ssid;

    // Disconnect from any existing connection first
    if (isConnected())
    {
        logger.debug("Disconnecting from current AP");
        esp_wifi_disconnect();
    }

    setState(WIFI_STATE_CONNECTING);

    // Create WiFi configuration
    wifi_config_t wifi_config = {};
    // Copy SSID
    strncpy((char *)wifi_config.sta.ssid, ssid.c_str(), sizeof(wifi_config.sta.ssid) - 1);
    vTaskDelay(1); // Yield to prevent watchdog
    // Copy password if provided
    if (password.length() > 0)
    {
        strncpy((char *)wifi_config.sta.password, password.c_str(), sizeof(wifi_config.sta.password) - 1);
    }
    vTaskDelay(1); // Yield to prevent watchdog

    // Set threshold for weakest authmode to accept (more permissive)
    wifi_config.sta.threshold.authmode = WIFI_AUTH_OPEN;
    wifi_config.sta.pmf_cfg.capable = true;
    wifi_config.sta.pmf_cfg.required = false;

    // Set scan method to be more reliable
    wifi_config.sta.scan_method = WIFI_FAST_SCAN;
    wifi_config.sta.sort_method = WIFI_CONNECT_AP_BY_SIGNAL;
    wifi_config.sta.failure_retry_cnt = 3;
    vTaskDelay(1); // Yield to prevent watchdog

    esp_err_t wifi_set_config_result = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
    if (wifi_set_config_result != ESP_OK)
    {
        logger.error((String("Failed to set WiFi config: ") + esp_err_to_name(wifi_set_config_result)).c_str());
        setState(WIFI_STATE_CONNECT_FAILED);
        return;
    }

    // Give WiFi stack time to process the config before connecting
    vTaskDelay(pdMS_TO_TICKS(100));

    esp_err_t wifi_connect_result = esp_wifi_connect();

    if (wifi_connect_result != ESP_OK)
    {
        logger.error((String("Failed to start WiFi connection: ") + esp_err_to_name(wifi_connect_result)).c_str());
        setState(WIFI_STATE_CONNECT_FAILED);
        return;
    }

    // Don't reset the attempt counter here - it should only be reset on successful connection
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

    logger.info("Starting WiFi scan");
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
    logger.debug("WiFi scan started");
}

bool Wifi::isScanning()
{
    return is_scanning;
}

void Wifi::handleScanComplete()
{
    logger.debug("Scan complete event");
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
        logger.info("Scan complete: no networks found");
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    knownWifiNetworksCount = min((int)scan_count, (int)MAX_KNOWN_WIFI_NETWORKS);
    logger.infof("Scan complete: %u networks", knownWifiNetworksCount);

    wifi_ap_record_t *ap_records = (wifi_ap_record_t *)malloc(scan_count * sizeof(wifi_ap_record_t));

    if (!ap_records)
    {
        logger.error("Failed to allocate memory for scan results");
        knownWifiNetworksCount = 0;
        Wifi::is_scanning = false;
        return;
    }

    logger.debug("Fetching AP records");
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
    for (uint8_t i = 0; i < knownWifiNetworksCount && i < MAX_KNOWN_WIFI_NETWORKS; i++)
    {
        // Skip empty SSIDs
        if (ap_records[i].ssid[0] == 0)
        {
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
        }
    }

    free(ap_records);
    Wifi::is_scanning = false;

    logger.debug("WiFi scan results stored");

    State::pushWifiEventToQueue(State::WIFI_EVENT_SCAN_DONE);
}

void Wifi::handleTimeout()
{
    if (isConnected())
    {
        return;
    }

    uint32_t currentTime = millis();
    uint32_t elapsed = currentTime - last_reconnect_attempt_time_ms;

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