#include "state/state.hpp"

// Required static member definitions — state.cpp is excluded from the native build.
SemaphoreHandle_t State::state_mutex = nullptr;
esp_ip4_addr_t State::wifi_ip = {};
bool State::wifi_connected = false;
String State::wifi_ssid;
esp_ip4_addr_t State::ethernet_ip = {};
bool State::ethernet_connected = false;
String State::websocket_hostname;
uint16_t State::websocket_port = 0;
bool State::websocket_use_ssl = false;
bool State::websocket_connected = false;
State::WebsocketPhase State::websocket_phase = State::WS_INIT;
String State::websocket_cert_name;
int State::websocket_cert_index = 0;
int State::websocket_cert_count = 0;
int State::websocket_remembered_retry_count = 0;
int State::websocket_next_attempt_seconds = 0;
bool State::api_authenticated = false;
String State::api_device_name;

// ----- State method implementations -----

void State::setWifiState(bool connected, esp_ip4_addr_t ip, String ssid) {
    wifi_connected = connected;
    wifi_ip = ip;
    wifi_ssid = ssid;
}
void State::setEthernetState(bool connected, esp_ip4_addr_t ip) {
    ethernet_connected = connected;
    ethernet_ip = ip;
}
State::NetworkState State::getNetworkState() {
    return {wifi_connected, wifi_ip, wifi_ssid, ethernet_connected, ethernet_ip};
}
void State::setWebsocketState(bool connected, String hostname, uint16_t port, bool useSSL) {
    websocket_connected = connected;
    websocket_hostname = hostname;
    websocket_port = port;
    websocket_use_ssl = useSSL;
}
void State::setWebsocketPhase(WebsocketPhase phase) { websocket_phase = phase; }
void State::setWebsocketCertProgress(String certName, int certIndex, int certCount, int rememberedRetryCount) {
    websocket_cert_name = certName;
    websocket_cert_index = certIndex;
    websocket_cert_count = certCount;
    websocket_remembered_retry_count = rememberedRetryCount;
}
void State::setWebsocketNextAttemptSeconds(int seconds) { websocket_next_attempt_seconds = seconds; }
State::WebsocketState State::getWebsocketState() {
    return {websocket_connected, websocket_hostname, websocket_port, websocket_use_ssl,
            websocket_phase, websocket_cert_name, websocket_cert_index, websocket_cert_count,
            websocket_remembered_retry_count, websocket_next_attempt_seconds};
}
void State::setApiState(bool authenticated, String deviceName) {
    api_authenticated = authenticated;
    api_device_name = deviceName;
}
State::ApiState State::getApiState() { return {api_authenticated, api_device_name}; }

// ----- Test helpers -----
// Use public State setters only — no access to private members needed.

static const esp_ip4_addr_t kZeroIp = {};

void mock_state_reset() {
    State::setWifiState(false, kZeroIp, "");
    State::setEthernetState(false, kZeroIp);
    State::setWebsocketState(false, "", 0, false);
    State::setWebsocketPhase(State::WS_INIT);
    State::setApiState(false, "");
}
void mock_state_set_websocket(bool connected, const char* hostname, uint16_t port, bool useSSL) {
    State::setWebsocketState(connected, hostname ? hostname : "", port, useSSL);
}
void mock_state_set_api(bool authenticated, const char* deviceName) {
    State::setApiState(authenticated, deviceName ? deviceName : "");
}
