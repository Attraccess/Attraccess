#include "wifi.hpp"
#include "../../platform.hpp"
#include "esp_log.h"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

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
        logger.error((std::string("Failed to start scan: ") + esp_err_to_name(err)).c_str());
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
        logger.error((std::string("Error getting scan count: ") + esp_err_to_name(err)).c_str());
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

    knownWifiNetworksCount = std::min((int)scan_count, (int)MAX_KNOWN_WIFI_NETWORKS);
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
        logger.error((std::string("Error getting scan records: ") + esp_err_to_name(err)).c_str());
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

            knownWifiNetworks[i].ssid = std::string(ssid_str);
            knownWifiNetworks[i].rssi = ap_records[i].rssi;
            knownWifiNetworks[i].encryptionType = ap_records[i].authmode;
            knownWifiNetworks[i].isOpen = (ap_records[i].authmode == WIFI_AUTH_OPEN);
            knownWifiNetworks[i].channel = ap_records[i].primary;
        }
    }

    free(ap_records);
    Wifi::is_scanning = false;

    logger.debug("WiFi scan results stored");

    // State::pushWifiEventToQueue(State::WIFI_EVENT_SCAN_DONE);
}

void Wifi::handleTimeout()
{
    if (_state == WIFI_STATE_CONNECTED_WAITING_FOR_IP)
    {
        if (millis() - waiting_for_ip_since_ms > WAITING_FOR_IP_TIMEOUT_MS)
        {
            logger.error("DHCP timeout - no IP acquired, forcing reconnect");
            esp_wifi_disconnect();
            setState(WIFI_STATE_CONNECT_FAILED);
        }
        return;
    }

    if (isConnected())
    {
        return;
    }

    uint32_t currentTime = millis();
    uint32_t elapsed = currentTime - last_reconnect_attempt_time_ms;

    if (elapsed > 15000)
    { // 15 second timeout
        logger.error("Connection timeout - stopping connection attempt");
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
