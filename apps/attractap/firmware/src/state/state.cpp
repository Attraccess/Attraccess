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
State::WebsocketPhase State::websocket_phase = State::WS_INIT;
String State::websocket_cert_name = "";
int State::websocket_cert_index = 0;
int State::websocket_cert_count = 0;
int State::websocket_remembered_retry_count = 0;
int State::websocket_next_attempt_seconds = 0;
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

void State::setWebsocketPhase(WebsocketPhase phase)
{
    websocket_phase = phase;
}

void State::setWebsocketCertProgress(String certName, int certIndex, int certCount, int rememberedRetryCount)
{
    websocket_cert_name = certName;
    websocket_cert_index = certIndex;
    websocket_cert_count = certCount;
    websocket_remembered_retry_count = rememberedRetryCount;
}

void State::setWebsocketNextAttemptSeconds(int seconds)
{
    websocket_next_attempt_seconds = seconds;
}

State::WebsocketState State::getWebsocketState()
{

    WebsocketState state;
    state.connected = websocket_connected;
    state.hostname = websocket_hostname;
    state.port = websocket_port;
    state.useSSL = websocket_use_ssl;
    state.phase = websocket_phase;
    state.certName = websocket_cert_name;
    state.certIndex = websocket_cert_index;
    state.certCount = websocket_cert_count;
    state.rememberedRetryCount = websocket_remembered_retry_count;
    state.secondsUntilNextAttempt = websocket_next_attempt_seconds;

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
