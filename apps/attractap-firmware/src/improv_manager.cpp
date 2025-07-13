#include "improv_manager.hpp"
#include <Arduino.h>
#include <WiFi.h>
#include <string.h> // Add this for strcmp
#include "configuration.hpp"
#ifdef NETWORK_WIFI
#include "network_wifi.hpp"
#endif

// Initialize the static instance pointer
ImprovManager *ImprovManager::instance = nullptr;

ImprovManager::ImprovManager(NetworkInterface *networkInterface)
    : improvSerial(&Serial), networkInterface(networkInterface)
{
    // Store the instance for use in static callbacks
    instance = this;
}

void ImprovManager::setup()
{
    // Set callback functions
    improvSerial.onImprovError(onImprovWiFiErrorCb);
    improvSerial.onImprovConnected(onImprovWiFiConnectedCb);

    // Update device URL based on current network status
    updateDeviceInfo();
}

void ImprovManager::updateDeviceInfo()
{
    char deviceUrl[32] = ""; // Initialize empty

    IPAddress ip = networkInterface->getCurrentIp();

    // Only set device URL if we have a valid IP (not 0.0.0.0)
    if (ip[0] != 0 || ip[1] != 0 || ip[2] != 0 || ip[3] != 0)
    {
        sprintf(deviceUrl, "http://%d.%d.%d.%d", ip[0], ip[1], ip[2], ip[3]);
    }
    else
    {
        Serial.println("[Improv] No network connection, device URL not set");
    }

    // Check if FIRMWARE_VARIANT_FRIENDLY_NAME is defined
#ifndef FIRMWARE_VARIANT_FRIENDLY_NAME
#error "FIRMWARE_VARIANT_FRIENDLY_NAME must be defined in platformio.ini"
#endif

    // Default to ESP32 chip family, check for specific models
    ImprovTypes::ChipFamily chipFamily = ImprovTypes::ChipFamily::CF_ESP32;

    // Check for ESP32-C3 chip
    if (strcmp(CHIP_FAMILY, "ESP32_C3") == 0)
    {
        chipFamily = ImprovTypes::ChipFamily::CF_ESP32_C3;
    }

    if (deviceUrl[0] == '\0')
    {
        // Setup Improv with device information
        improvSerial.setDeviceInfo(
            chipFamily,
            FIRMWARE_FRIENDLY_NAME "_" FIRMWARE_VARIANT_FRIENDLY_NAME,
            FIRMWARE_VERSION,
            FIRMWARE_FRIENDLY_NAME "_" FIRMWARE_VARIANT_FRIENDLY_NAME);
    }

    // Setup Improv with device information
    improvSerial.setDeviceInfo(
        chipFamily,
        FIRMWARE_FRIENDLY_NAME "_" FIRMWARE_VARIANT_FRIENDLY_NAME,
        FIRMWARE_VERSION,
        FIRMWARE_FRIENDLY_NAME "_" FIRMWARE_VARIANT_FRIENDLY_NAME,
        deviceUrl);
}

void ImprovManager::loop()
{
    // Handle incoming Improv commands
    improvSerial.handleSerial();

    // Periodically update the device URL
    static unsigned long lastUpdate = 0;
    if (millis() - lastUpdate > 5000) // Every 5 seconds
    {
        updateDeviceInfo();
        lastUpdate = millis();
    }
}

// Static callback for Improv errors
void ImprovManager::onImprovWiFiErrorCb(ImprovTypes::Error error)
{
    Serial.print("[Improv] Error: ");
    switch (error)
    {
    case ImprovTypes::Error::ERROR_NONE:
        Serial.println("None");
        break;
    case ImprovTypes::Error::ERROR_INVALID_RPC:
        Serial.println("Invalid RPC");
        break;
    case ImprovTypes::Error::ERROR_UNKNOWN_RPC:
        Serial.println("Unknown RPC");
        break;
    case ImprovTypes::Error::ERROR_UNABLE_TO_CONNECT:
        Serial.println("Unable to connect");
        break;
    case ImprovTypes::Error::ERROR_NOT_AUTHORIZED:
        Serial.println("Not authorized");
        break;
    case ImprovTypes::Error::ERROR_UNKNOWN:
        Serial.println("Unknown error");
        break;
    default:
        Serial.println("Unexpected error");
        break;
    }
}

// Static callback for when WiFi is connected via Improv
void ImprovManager::onImprovWiFiConnectedCb(const char *ssid, const char *password)
{
#ifdef NETWORK_WIFI
    Serial.print("[Improv] Successfully connected to WiFi SSID: ");
    Serial.println(ssid);

    // Save credentials to persistence
    Persistence::saveWiFiCredentials(ssid, password);

    // Tell the WiFi network to reconnect with the new credentials
    if (instance && instance->networkInterface)
    {
        // Cast to NetworkWifi only if we're using WiFi
        NetworkWifi *wifiInterface = (NetworkWifi *)instance->networkInterface;
        wifiInterface->reconnect();
    }
#else
    // In Ethernet mode, we don't need to handle WiFi credentials
    Serial.println("[Improv] Received WiFi credentials but device is in Ethernet mode");
#endif
}