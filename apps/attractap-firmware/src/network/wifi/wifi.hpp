#pragma once

#include <Arduino.h>
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "../../settings/settings.hpp"
#include "task_priorities.h"
#include "../../state/state.hpp"
#include "../../logger/logger.hpp"

class Wifi
{
public:
    static const uint8_t MAX_KNOWN_WIFI_NETWORKS = 20;
    struct WifiCredentials
    {
        String ssid;
        String password;
    };
    enum WifiState
    {
        WIFI_STATE_INIT,
        WIFI_STATE_CONNECTING,
        WIFI_STATE_CONNECTED_WAITING_FOR_IP,
        WIFI_STATE_CONNECTED,
        WIFI_STATE_DISCONNECTED,
        WIFI_STATE_CONNECT_FAILED
    };
    struct WifiNetwork
    {
        String ssid;
        int32_t rssi;
        wifi_auth_mode_t encryptionType;
        bool isOpen;
        uint8_t channel;
    };
    struct WifiScanResult
    {
        WifiNetwork networks[MAX_KNOWN_WIFI_NETWORKS];
        uint8_t count;
    };

    static void setup();
    static void connectToNetwork(const String &ssid, const String &password);
    static WifiState getState();
    static esp_ip4_addr_t getIPAddress();
    static void startScan();
    static bool isScanning();
    static WifiScanResult getKnownWifiNetworks();
    static bool isConnected();

private:
    static void taskFn(void *parameter);
    static void loop();

    static WifiState _state;
    static bool is_setup;
    static bool is_scanning;
    static uint8_t current_reconnect_attempts_count;
    static uint32_t last_reconnect_attempt_time_ms;
    static const uint32_t RECONNECT_INTERVAL_MS;
    static void tryAutoConnect();
    static bool hasSavedCredentials();
    static WifiNetwork knownWifiNetworks[MAX_KNOWN_WIFI_NETWORKS];
    static uint8_t knownWifiNetworksCount;
    static void handleScanComplete();

    static String _lastSSID;

    static void setState(WifiState state);
    static void handleTimeout();
    static void ensureConnection();

    static void wifiEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);
    static void ipEventHandler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data);

    // Helpers for readable logging
    static const char *getStateName(WifiState state);
    static const char *getDisconnectReasonName(uint8_t reasonCode);

    static esp_netif_t *wifi_interface;
    static Logger logger;
};