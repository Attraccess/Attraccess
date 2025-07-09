#include "network_ethernet.hpp"

void NetworkEthernet::setup()
{
    Serial.println("Setting up Ethernet...");

    uint8_t mac[6];
    esp_efuse_mac_get_default(mac);
    Ethernet.init(PIN_SPI_CS_ETH);

    Serial.println("Checking Ethernet hardware...");

    if (Ethernet.hardwareStatus() == EthernetNoHardware)
    {
        Serial.println("Ethernet hardware not found");
        delay(5000);
    }

    Serial.println("Ethernet Hardware connected");

    Ethernet.begin(mac);

    int attempts = 0;
    while (!this->isHealthy() && attempts < 60)
    {
        Serial.println("Waiting for Ethernet connection...");
        delay(1000);
        attempts++;
    }

    if (!this->isHealthy())
    {
        Serial.println("Failed to connect to Ethernet");
        ESP.restart();
    }
}

bool NetworkEthernet::isHealthy()
{
    Ethernet.maintain();

    IPAddress currentIp = this->getCurrentIp();

    return Ethernet.linkStatus() == LinkON;
}

IPAddress NetworkEthernet::getCurrentIp()
{
    return Ethernet.localIP();
}

void NetworkEthernet::end()
{
}

void NetworkEthernet::loop()
{
    Ethernet.maintain();
}

EthernetClient &NetworkEthernet::getClient()
{
    return this->client;
}