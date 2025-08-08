#include "state.hpp"

portMUX_TYPE State::stateMutex = portMUX_INITIALIZER_UNLOCKED;
uint32_t State::_lastStateChangeTime;

esp_ip4_addr_t State::wifi_ip;
bool State::wifi_connected;
String State::wifi_ssid;

esp_ip4_addr_t State::ethernet_ip;
bool State::ethernet_connected;

String State::websocket_hostname;
uint16_t State::websocket_port;
bool State::websocket_use_ssl;
bool State::websocket_connected;

bool State::api_authenticated;
String State::api_device_name;

State::State()
{
    _lastStateChangeTime = millis();
}

void State::onStateChanged()
{
    _lastStateChangeTime = millis();
}

uint32_t State::getLastStateChangeTime()
{
    taskENTER_CRITICAL(&State::stateMutex);
    uint32_t lastStateChangeTime = _lastStateChangeTime;
    taskEXIT_CRITICAL(&State::stateMutex);
    return lastStateChangeTime;
}

void State::setEthernetState(bool connected, esp_ip4_addr_t ip)
{
    taskENTER_CRITICAL(&State::stateMutex);
    ethernet_ip = ip;
    ethernet_connected = connected;
    this->onStateChanged();
    taskEXIT_CRITICAL(&State::stateMutex);
}

void State::setWifiState(bool connected, esp_ip4_addr_t ip, String ssid)
{
    taskENTER_CRITICAL(&State::stateMutex);
    wifi_connected = connected;
    wifi_ip = ip;
    wifi_ssid = ssid;
    this->onStateChanged();
    taskEXIT_CRITICAL(&State::stateMutex);
}

State::NetworkState State::getNetworkState()
{
    taskENTER_CRITICAL(&State::stateMutex);
    NetworkState state;
    state.wifi_connected = wifi_connected;
    state.wifi_ip = wifi_ip;
    state.wifi_ssid = wifi_ssid;

    state.ethernet_connected = ethernet_connected;
    state.ethernet_ip = ethernet_ip;
    taskEXIT_CRITICAL(&State::stateMutex);

    return state;
}

void State::setWebsocketState(bool connected, String hostname, uint16_t port, bool useSSL)
{
    taskENTER_CRITICAL(&State::stateMutex);
    websocket_connected = connected;
    websocket_hostname = hostname;
    websocket_port = port;
    websocket_use_ssl = useSSL;
    this->onStateChanged();
    taskEXIT_CRITICAL(&State::stateMutex);
}

State::WebsocketState State::getWebsocketState()
{
    taskENTER_CRITICAL(&State::stateMutex);
    WebsocketState state;
    state.connected = websocket_connected;
    state.hostname = websocket_hostname;
    state.port = websocket_port;
    state.useSSL = websocket_use_ssl;
    taskEXIT_CRITICAL(&State::stateMutex);

    return state;
}

void State::setApiState(bool authenticated, String deviceName)
{
    taskENTER_CRITICAL(&State::stateMutex);
    api_authenticated = authenticated;
    api_device_name = deviceName;
    this->onStateChanged();
    taskEXIT_CRITICAL(&State::stateMutex);
}

State::ApiState State::getApiState()
{
    taskENTER_CRITICAL(&State::stateMutex);
    ApiState state;
    state.authenticated = api_authenticated;
    state.deviceName = api_device_name;
    taskEXIT_CRITICAL(&State::stateMutex);

    return state;
}