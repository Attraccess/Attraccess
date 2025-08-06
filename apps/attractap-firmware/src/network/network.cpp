#include "network.hpp"
#include "esp_err.h"
#include "esp_log.h"

// Static member definitions
Network::NetworkState Network::_state = NETWORK_STATE_INIT;
Network::NetworkType Network::_activeType = NETWORK_TYPE_NONE;
bool Network::_wifiConnected = false;
bool Network::_ethernetConnected = false;
esp_ip4_addr_t Network::_wifiIP = {0};
esp_ip4_addr_t Network::_ethernetIP = {0};
void (*Network::onStateChangedCallback)(NetworkState state, NetworkType type, const esp_ip4_addr_t &wifi_ip, const esp_ip4_addr_t &ethernet_ip) = nullptr;
bool Network::_sharedComponentsInitialized = false;

void Network::setup()
{
    Serial.println("[INFO][Network] Initializing Network Manager");

    // Initialize shared ESP-IDF networking components
    initSharedComponents();

    // Set up callbacks before initializing services
    Wifi::setStateChangedCallback(wifiStateChangedCallback);
    Ethernet::setStateChangedCallback(ethernetStateChangedCallback);

    // Initialize both network interfaces
    Serial.println("[INFO][Network] Starting WiFi interface");
    Wifi::setup();

    Serial.println("[INFO][Network] Starting Ethernet interface");
    Ethernet::setup();

    Serial.println("[INFO][Network] Network Manager initialization complete");
}

void Network::initSharedComponents()
{
    if (_sharedComponentsInitialized)
    {
        Serial.println("[INFO][Network] Shared components already initialized");
        return;
    }

    Serial.println("[INFO][Network] Initializing shared ESP-IDF networking components");

    // Initialize TCP/IP network interface (should be called only once in application)
    esp_err_t ret = esp_netif_init();
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
    {
        Serial.printf("[ERROR][Network] Failed to initialize netif: %s\n", esp_err_to_name(ret));
        return;
    }

    // Create default event loop
    ret = esp_event_loop_create_default();
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE)
    {
        Serial.printf("[ERROR][Network] Failed to create event loop: %s\n", esp_err_to_name(ret));
        return;
    }

    _sharedComponentsInitialized = true;
    Serial.println("[INFO][Network] Shared networking components initialized");
}

void Network::setStateChangedCallback(void (*callback)(NetworkState state, NetworkType type, const esp_ip4_addr_t &wifi_ip, const esp_ip4_addr_t &ethernet_ip))
{
    onStateChangedCallback = callback;
}

void Network::wifiStateChangedCallback(Wifi::WifiState state, const esp_ip4_addr_t &ip)
{
    Serial.printf("[INFO][Network] WiFi state changed: %d\n", state);

    _wifiConnected = (state == Wifi::WIFI_STATE_CONNECTED);
    _wifiIP = ip;

    updateNetworkState();
}

void Network::ethernetStateChangedCallback(Ethernet::EthernetState state, const esp_ip4_addr_t &ip)
{
    Serial.printf("[INFO][Network] Ethernet state changed: %d\n", state);

    _ethernetConnected = (state == Ethernet::ETHERNET_STATE_CONNECTED);
    _ethernetIP = ip;

    updateNetworkState();
}

void Network::updateNetworkState()
{
    NetworkState newState = NETWORK_STATE_DISCONNECTED;
    NetworkType newActiveType = NETWORK_TYPE_NONE;
    esp_ip4_addr_t activeIP = {0};

    // Determine active network type and state
    // Ethernet takes priority over WiFi if both are connected
    if (_ethernetConnected)
    {
        newActiveType = NETWORK_TYPE_ETHERNET;
        newState = NETWORK_STATE_CONNECTED;
        activeIP = _ethernetIP;
    }
    else if (_wifiConnected)
    {
        newActiveType = NETWORK_TYPE_WIFI;
        newState = NETWORK_STATE_CONNECTED;
        activeIP = _wifiIP;
    }
    else
    {
        // Neither connected - determine if we're connecting or failed
        Wifi::WifiState wifiState = Wifi::getState();
        Ethernet::EthernetState ethernetState = Ethernet::getState();

        // Check if either is connecting or waiting for IP
        if (wifiState == Wifi::WIFI_STATE_CONNECTING ||
            wifiState == Wifi::WIFI_STATE_CONNECTED_WAITING_FOR_IP ||
            ethernetState == Ethernet::ETHERNET_STATE_CONNECTING ||
            ethernetState == Ethernet::ETHERNET_STATE_CONNECTED_WAITING_FOR_IP)
        {
            newState = NETWORK_STATE_CONNECTING;
            // Prefer Ethernet if both are connecting
            if (ethernetState == Ethernet::ETHERNET_STATE_CONNECTING ||
                ethernetState == Ethernet::ETHERNET_STATE_CONNECTED_WAITING_FOR_IP)
            {
                newActiveType = NETWORK_TYPE_ETHERNET;
                if (ethernetState == Ethernet::ETHERNET_STATE_CONNECTED_WAITING_FOR_IP)
                {
                    newState = NETWORK_STATE_CONNECTED_WAITING_FOR_IP;
                }
            }
            else
            {
                newActiveType = NETWORK_TYPE_WIFI;
                if (wifiState == Wifi::WIFI_STATE_CONNECTED_WAITING_FOR_IP)
                {
                    newState = NETWORK_STATE_CONNECTED_WAITING_FOR_IP;
                }
            }
        }
        else if (wifiState == Wifi::WIFI_STATE_CONNECT_FAILED &&
                 ethernetState == Ethernet::ETHERNET_STATE_CONNECT_FAILED)
        {
            newState = NETWORK_STATE_FAILED;
        }
        else
        {
            newState = NETWORK_STATE_DISCONNECTED;
        }
    }

    // Update state if changed
    bool stateChanged = (_state != newState) || (_activeType != newActiveType);
    if (stateChanged)
    {
        _state = newState;
        _activeType = newActiveType;

        Serial.printf("[INFO][Network] Network state changed to: %d, active type: %d\n", newState, newActiveType);

        if (onStateChangedCallback)
        {
            onStateChangedCallback(newState, newActiveType, _wifiIP, _ethernetIP);
        }
    }
}

Network::NetworkState Network::getState()
{
    return _state;
}

Network::NetworkType Network::getActiveNetworkType()
{
    return _activeType;
}

esp_ip4_addr_t Network::getIPAddress()
{
    // Return IP of active connection (Ethernet preferred)
    if (_ethernetConnected)
    {
        return _ethernetIP;
    }
    else if (_wifiConnected)
    {
        return _wifiIP;
    }

    esp_ip4_addr_t emptyIP = {0};
    return emptyIP;
}

Network::NetworkInfo Network::getNetworkInfo()
{
    NetworkInfo info;
    info.state = _state;
    info.activeType = _activeType;
    info.ip = getIPAddress();
    info.wifiConnected = _wifiConnected;
    info.ethernetConnected = _ethernetConnected;
    info.wifiIP = _wifiIP;
    info.ethernetIP = _ethernetIP;

    return info;
}

bool Network::isConnected()
{
    return _state == NETWORK_STATE_CONNECTED;
}

// WiFi pass-through methods
void Network::connectToWifiNetwork(const String &ssid, const String &password)
{
    Wifi::connectToNetwork(ssid, password);
}

void Network::startWifiScan()
{
    Wifi::startScan();
}

bool Network::isWifiScanning()
{
    return Wifi::isScanning();
}

Wifi::WifiScanResult Network::getKnownWifiNetworks()
{
    return Wifi::getKnownWifiNetworks();
}

void Network::setWifiScanCompleteCallback(void (*callback)(Wifi::WifiNetwork *networks, uint8_t count))
{
    Wifi::setScanCompleteCallback(callback);
}

Network::NetworkState Network::mapWifiState(Wifi::WifiState state)
{
    switch (state)
    {
    case Wifi::WIFI_STATE_INIT:
        return NETWORK_STATE_INIT;
    case Wifi::WIFI_STATE_CONNECTING:
        return NETWORK_STATE_CONNECTING;
    case Wifi::WIFI_STATE_CONNECTED_WAITING_FOR_IP:
        return NETWORK_STATE_CONNECTED_WAITING_FOR_IP;
    case Wifi::WIFI_STATE_CONNECTED:
        return NETWORK_STATE_CONNECTED;
    case Wifi::WIFI_STATE_DISCONNECTED:
        return NETWORK_STATE_DISCONNECTED;
    case Wifi::WIFI_STATE_CONNECT_FAILED:
        return NETWORK_STATE_FAILED;
    default:
        return NETWORK_STATE_DISCONNECTED;
    }
}

Network::NetworkState Network::mapEthernetState(Ethernet::EthernetState state)
{
    switch (state)
    {
    case Ethernet::ETHERNET_STATE_INIT:
        return NETWORK_STATE_INIT;
    case Ethernet::ETHERNET_STATE_CONNECTING:
        return NETWORK_STATE_CONNECTING;
    case Ethernet::ETHERNET_STATE_CONNECTED_WAITING_FOR_IP:
        return NETWORK_STATE_CONNECTED_WAITING_FOR_IP;
    case Ethernet::ETHERNET_STATE_CONNECTED:
        return NETWORK_STATE_CONNECTED;
    case Ethernet::ETHERNET_STATE_DISCONNECTED:
        return NETWORK_STATE_DISCONNECTED;
    case Ethernet::ETHERNET_STATE_CONNECT_FAILED:
        return NETWORK_STATE_FAILED;
    default:
        return NETWORK_STATE_DISCONNECTED;
    }
}