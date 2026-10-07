#include "wifi.hpp"
#include "platform.hpp"
#include "esp_log.h"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

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

    std::string savedSSID = Settings::getNetworkConfig().ssid;
    std::string savedPassword = Settings::getNetworkConfig().password;

    logger.infof("Reconnect attempt #%u to '%s'", current_reconnect_attempts_count, savedSSID.c_str());
    connectToNetwork(savedSSID, savedPassword);
}

bool Wifi::hasSavedCredentials()
{
    return Settings::getNetworkConfig().ssid.length() > 0;
}

void Wifi::connectToNetwork(const std::string &ssid, const std::string &password)
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
        logger.error((std::string("Failed to set WiFi config: ") + esp_err_to_name(wifi_set_config_result)).c_str());
        setState(WIFI_STATE_CONNECT_FAILED);
        return;
    }

    // Give WiFi stack time to process the config before connecting
    vTaskDelay(pdMS_TO_TICKS(100));

    esp_err_t wifi_connect_result = esp_wifi_connect();

    if (wifi_connect_result != ESP_OK)
    {
        logger.error((std::string("Failed to start WiFi connection: ") + esp_err_to_name(wifi_connect_result)).c_str());
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
