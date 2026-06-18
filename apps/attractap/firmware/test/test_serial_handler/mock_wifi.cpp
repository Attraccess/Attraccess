#include "network/wifi/wifi.hpp"

// ----- File-static test state -----
// The Wifi class members below are defined to satisfy the linker.
// Implementations read/write from these file-static variables so that
// mock_wifi_* helpers can manipulate them without accessing private members.

static bool g_scanning = false;
static Wifi::WifiScanResult g_scan_result{};

// Required static member definitions — wifi.cpp excluded from native build.
Wifi::WifiState Wifi::_state = Wifi::WIFI_STATE_INIT;
bool Wifi::is_setup = false;
bool Wifi::is_scanning = false;      // defined for linker; logic uses g_scanning
uint8_t Wifi::current_reconnect_attempts_count = 0;
uint32_t Wifi::last_reconnect_attempt_time_ms = 0;
uint32_t Wifi::waiting_for_ip_since_ms = 0;
const uint32_t Wifi::RECONNECT_INTERVAL_MS = 5000;
const uint32_t Wifi::WAITING_FOR_IP_TIMEOUT_MS = 15000;
Wifi::WifiNetwork Wifi::knownWifiNetworks[Wifi::MAX_KNOWN_WIFI_NETWORKS] = {};
uint8_t Wifi::knownWifiNetworksCount = 0;
String Wifi::_lastSSID;
esp_netif_t* Wifi::wifi_interface = nullptr;
Logger Wifi::logger("Wifi");

// ----- Wifi method implementations -----

void Wifi::setup() {}
void Wifi::loop() {}
void Wifi::connectToNetwork(const String&, const String&) {}
Wifi::WifiState Wifi::getState() { return _state; }
esp_ip4_addr_t Wifi::getIPAddress() { return {}; }
void Wifi::startScan() {}
bool Wifi::isScanning() { return g_scanning; }
Wifi::WifiScanResult Wifi::getKnownWifiNetworks() { return g_scan_result; }
bool Wifi::isConnected() { return _state == WIFI_STATE_CONNECTED; }

// Private stubs required for linking
void Wifi::setState(WifiState s) { _state = s; }
void Wifi::handleTimeout() {}
void Wifi::ensureConnection() {}
void Wifi::tryAutoConnect() {}
bool Wifi::hasSavedCredentials() { return false; }
void Wifi::handleScanComplete() {}
const char* Wifi::getStateName(WifiState) { return "UNKNOWN"; }
const char* Wifi::getDisconnectReasonName(uint8_t) { return "UNKNOWN"; }
void Wifi::wifiEventHandler(void*, esp_event_base_t, int32_t, void*) {}
void Wifi::ipEventHandler(void*, esp_event_base_t, int32_t, void*) {}

// ----- Test helpers -----

void mock_wifi_reset() {
    g_scanning = false;
    g_scan_result = {};
}
void mock_wifi_set_scanning(bool v) { g_scanning = v; }
void mock_wifi_add_network(const char* ssid, int32_t rssi, wifi_auth_mode_t enc, bool isOpen, uint8_t ch) {
    if (g_scan_result.count >= Wifi::MAX_KNOWN_WIFI_NETWORKS) return;
    auto& n = g_scan_result.networks[g_scan_result.count++];
    n.ssid = ssid ? ssid : "";
    n.rssi = rssi;
    n.encryptionType = enc;
    n.isOpen = isOpen;
    n.channel = ch;
}
