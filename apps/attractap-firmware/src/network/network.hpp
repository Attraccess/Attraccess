#pragma once

#include <Arduino.h>
#include "esp_netif.h"
#include "wifi/wifi.hpp"
#include "ethernet/ethernet.hpp"

/**
 * Network management class that handles both WiFi and Ethernet connections
 * Manages shared ESP-IDF components and provides a unified network interface
 */
class Network
{
public:
    enum NetworkType
    {
        NETWORK_TYPE_NONE,
        NETWORK_TYPE_WIFI,
        NETWORK_TYPE_ETHERNET
    };

    enum NetworkState
    {
        NETWORK_STATE_INIT,
        NETWORK_STATE_CONNECTING,
        NETWORK_STATE_CONNECTED_WAITING_FOR_IP,
        NETWORK_STATE_CONNECTED,
        NETWORK_STATE_DISCONNECTED,
        NETWORK_STATE_FAILED
    };

    struct NetworkInfo
    {
        NetworkState state;
        NetworkType activeType;
        esp_ip4_addr_t ip;
        bool wifiConnected;
        bool ethernetConnected;
        esp_ip4_addr_t wifiIP;
        esp_ip4_addr_t ethernetIP;
    };

    // Main interface
    static void setup();
    static void setStateChangedCallback(void (*callback)(NetworkState state, NetworkType type, const esp_ip4_addr_t &wifi_ip, const esp_ip4_addr_t &ethernet_ip));

    // Status getters
    static NetworkState getState();
    static NetworkType getActiveNetworkType();
    static esp_ip4_addr_t getIPAddress();
    static NetworkInfo getNetworkInfo();
    static bool isConnected();

    // WiFi pass-through methods
    static void connectToWifiNetwork(const String &ssid, const String &password);
    static void startWifiScan();
    static bool isWifiScanning();
    static Wifi::WifiScanResult getKnownWifiNetworks();
    static void setWifiScanCompleteCallback(void (*callback)(Wifi::WifiNetwork *networks, uint8_t count));

private:
    static void initSharedComponents();
    static void wifiStateChangedCallback(Wifi::WifiState state, const esp_ip4_addr_t &ip);
    static void ethernetStateChangedCallback(Ethernet::EthernetState state, const esp_ip4_addr_t &ip);
    static void updateNetworkState();
    static NetworkState mapWifiState(Wifi::WifiState state);
    static NetworkState mapEthernetState(Ethernet::EthernetState state);

    // State tracking
    static NetworkState _state;
    static NetworkType _activeType;
    static bool _wifiConnected;
    static bool _ethernetConnected;
    static esp_ip4_addr_t _wifiIP;
    static esp_ip4_addr_t _ethernetIP;

    // Callback
    static void (*onStateChangedCallback)(NetworkState state, NetworkType type, const esp_ip4_addr_t &wifi_ip, const esp_ip4_addr_t &ethernet_ip);

    // Initialization flag
    static bool _sharedComponentsInitialized;
};