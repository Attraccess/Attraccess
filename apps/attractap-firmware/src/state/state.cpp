#include "state.hpp"

// Static member definitions
esp_ip4_addr_t State::wifi_ip = {};
bool State::wifi_connected = false;
String State::wifi_ssid = "";
esp_ip4_addr_t State::ethernet_ip = {};
bool State::ethernet_connected = false;
String State::websocket_hostname = "";
uint16_t State::websocket_port = 0;
bool State::websocket_use_ssl = false;
bool State::websocket_connected = false;
bool State::api_authenticated = false;
String State::api_device_name = "";

void State::setEthernetState(bool connected, esp_ip4_addr_t ip)
{
    ethernet_ip = ip;
    ethernet_connected = connected;
}

void State::setWifiState(bool connected, esp_ip4_addr_t ip, String ssid)
{
    wifi_connected = connected;
    wifi_ip = ip;
    wifi_ssid = ssid;
}

State::NetworkState State::getNetworkState()
{
    NetworkState state;
    state.wifi_connected = wifi_connected;
    state.wifi_ip = wifi_ip;
    state.wifi_ssid = wifi_ssid;

    state.ethernet_connected = ethernet_connected;
    state.ethernet_ip = ethernet_ip;

    return state;
}

void State::setWebsocketState(bool connected, String hostname, uint16_t port, bool useSSL)
{
    websocket_connected = connected;
    websocket_hostname = hostname;
    websocket_port = port;
    websocket_use_ssl = useSSL;
}

State::WebsocketState State::getWebsocketState()
{

    WebsocketState state;
    state.connected = websocket_connected;
    state.hostname = websocket_hostname;
    state.port = websocket_port;
    state.useSSL = websocket_use_ssl;

    return state;
}

void State::setApiState(bool authenticated, String deviceName)
{

    api_authenticated = authenticated;
    api_device_name = deviceName;
}

State::ApiState State::getApiState()
{

    ApiState state;
    state.authenticated = api_authenticated;
    state.deviceName = api_device_name;

    return state;
}
