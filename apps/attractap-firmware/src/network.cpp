#include <Arduino.h>
#include "network.hpp"

Network::Network(Display *display)
{
    this->display = display;
    this->lastHealthCheck = 0;
}

Network::~Network()
{
    this->interface->end();
}

void Network::setup()
{
    Serial.println("Setting up server connection interface...");
    this->interface->setup();

    Serial.println("Server connection interface setup done.");

    this->lastHealthCheck = millis(); // Set time for next check
}

void Network::loop()
{
    this->interface->loop();

    // Perform periodic health checks using millis()
    unsigned long currentMillis = millis();
    if (currentMillis - this->lastHealthCheck >= HEALTH_CHECK_INTERVAL_MS)
    {
        this->lastHealthCheck = currentMillis;
        bool is_currently_healthy = this->interface->isHealthy();

        IPAddress ip = this->interface->getCurrentIp();
        this->display->set_ip_address(ip);

        if (is_currently_healthy != this->was_healthy)
        {
            if (is_currently_healthy)
            {
                Serial.println("[Network] Connection established. IP: " + ip.toString());
            }
            else // Connection lost
            {
                Serial.println("[Network] Connection lost.");
            }

            Serial.println("[Network] Setting network connected to " + String(is_currently_healthy));
            this->display->set_network_connected(is_currently_healthy);

            this->was_healthy = is_currently_healthy;
        }
    }
}

bool Network::isHealthy()
{
    return this->interface->isHealthy();
}