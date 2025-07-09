#include "network_wifi.hpp"

void NetworkWifi::setup()
{
    this->reconnect();
}

bool NetworkWifi::isHealthy()
{
    return WiFi.status() == WL_CONNECTED;
}

void NetworkWifi::loop()
{
}

IPAddress NetworkWifi::getCurrentIp()
{
    return WiFi.localIP();
}

void NetworkWifi::end()
{
    WiFi.disconnect();
}

WiFiClient &NetworkWifi::getClient()
{
    return this->client;
}

void NetworkWifi::reconnect()
{
    WiFi.disconnect();

    if (Persistence::isWiFiConfigured())
    {
        const char *ssid = Persistence::getWiFiSSID();
        const char *password = Persistence::getWiFiPassword();

        Serial.printf("[WiFi] Connecting with stored credentials: %s\n", ssid);
        WiFi.begin(ssid, password);
        useConfigCredentials = true;
    }
}