#include "wifi_mac.hpp"
#include "wifi.hpp"
#include "platform.hpp"

#include "esp_log.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

bool Wifi::is_setup = false;
esp_netif_t *Wifi::wifi_interface = NULL;
Logger Wifi::logger("WiFi");

Wifi::WifiState Wifi::_state = WIFI_STATE_INIT;
std::string Wifi::_lastSSID;

uint8_t Wifi::current_reconnect_attempts_count = 0;
uint32_t Wifi::last_reconnect_attempt_time_ms = 0;
uint32_t Wifi::waiting_for_ip_since_ms = 0;
const uint32_t Wifi::RECONNECT_INTERVAL_MS = 10000;
const uint32_t Wifi::WAITING_FOR_IP_TIMEOUT_MS = 15000;

bool Wifi::is_scanning = false;
Wifi::WifiNetwork Wifi::knownWifiNetworks[MAX_KNOWN_WIFI_NETWORKS];
uint8_t Wifi::knownWifiNetworksCount = 0;


void Wifi::setup()
{
    logger.info("Initializing WiFi");

    if (is_setup)
    {
        logger.info("Already initialized");
        return;
    }

    // Suppress ESP-IDF idle scan chatter while retaining WiFi warnings.
    esp_log_level_set("wifi", ESP_LOG_WARN);

    wifi_interface = esp_netif_create_default_wifi_sta();
    if (wifi_interface == NULL)
    {
        logger.error("Failed to create WiFi station interface");
        return;
    }

    std::string hostname = Settings::getHostname() + "-wifi";
    esp_netif_set_hostname(wifi_interface, hostname.c_str());
    logger.infof("Hostname set to %s", hostname.c_str());

    // Configure WiFi memory settings for lower RAM usage
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();

    // Reduce memory allocations to fit available internal RAM
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
        logger.error((std::string("Failed to initialize WiFi: ") + esp_err_to_name(wifi_init_result)).c_str());

        logger.infof("Free internal heap before WiFi: %u", heap_caps_get_free_size(MALLOC_CAP_INTERNAL));
        return;
    }

    // Register event handlers
    esp_err_t wifi_event_handler_result = esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifiEventHandler, NULL);
    if (wifi_event_handler_result != ESP_OK)
    {
        logger.error((std::string("Failed to register WiFi event handler: ") + esp_err_to_name(wifi_event_handler_result)).c_str());
        return;
    }

    esp_err_t ip_event_handler_result = esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &ipEventHandler, NULL);
    if (ip_event_handler_result != ESP_OK)
    {
        logger.error((std::string("Failed to register IP event handler: ") + esp_err_to_name(ip_event_handler_result)).c_str());
        return;
    }

    // Set WiFi mode to station
    esp_err_t wifi_set_mode_result = esp_wifi_set_mode(WIFI_MODE_STA);
    if (wifi_set_mode_result != ESP_OK)
    {
        logger.error((std::string("Failed to set WiFi mode: ") + esp_err_to_name(wifi_set_mode_result)).c_str());
        return;
    }

    esp_err_t wifi_start_result = esp_wifi_start();
    if (wifi_start_result != ESP_OK)
    {
        logger.error((std::string("Failed to start WiFi: ") + esp_err_to_name(wifi_start_result)).c_str());
        return;
    }

    // Disable modem sleep: the default WIFI_PS_MIN_MODEM adds ~tens of ms of
    // latency to every TLS handshake, websocket heartbeat and reconnect.
    // This device is mains-powered; the RF power saving is not worth the
    // network latency (PERFORMANCE_ANALYSIS.md quick win Q1).
    esp_err_t wifi_ps_result = esp_wifi_set_ps(WIFI_PS_NONE);
    if (wifi_ps_result != ESP_OK)
    {
        logger.error((std::string("Failed to disable WiFi modem sleep: ") + esp_err_to_name(wifi_ps_result)).c_str());
    }

    is_setup = true;
}
