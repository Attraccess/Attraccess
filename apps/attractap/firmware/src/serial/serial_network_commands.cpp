#include "serialCommandHandler.hpp"

#ifndef ATTRACTAP_HOST

#include <ArduinoJson.h>
#include <lwip/inet.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/usb_serial_jtag.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "../settings/settings.hpp"
#include "../network/wifi/wifi.hpp"
#include "../state/state.hpp"
#include "../utils.hpp"
#include "platform.hpp"

void SerialCommandHandler::handleAuthorizedCommand(const std::string &topic, JsonObject payloadObj)
{
    if (topic == "network.status.get")
    {
        auto net = State::getNetworkState();

        DynamicJsonDocument resp(192);
        resp["wifi_connected"] = net.wifi_connected;
        resp["wifi_ssid"] = net.wifi_ssid;
        resp["wifi_ip"] = net.wifi_connected ? ipToString(net.wifi_ip) : "";
        resp["ethernet_connected"] = net.ethernet_connected;
        resp["ethernet_ip"] = net.ethernet_connected ? ipToString(net.ethernet_ip) : "";

        std::string json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    if (topic == "network.wifi.ssids.get")
    {
        Wifi::startScan();
        uint32_t start = millis();
        while (Wifi::isScanning() && (millis() - start) < 10000)
        {
            vTaskDelay(pdMS_TO_TICKS(50));
        }

        if (Wifi::isScanning())
        {
            sendErrorResponse(topic, "WIFI_SCAN_TIMEOUT");
            return;
        }

        Wifi::WifiScanResult scan = Wifi::getKnownWifiNetworks();

        // Allocate roughly 96 bytes per network plus base
        DynamicJsonDocument resp(512 + (scan.count * 96));
        JsonArray arr = resp.to<JsonArray>();

        for (uint8_t i = 0; i < scan.count; i++)
        {
            JsonObject obj = arr.createNestedObject();
            obj["ssid"] = scan.networks[i].ssid;
            obj["rssi"] = scan.networks[i].rssi;
            obj["channel"] = scan.networks[i].channel;
            obj["encryption"] = encryptionTypeToString(scan.networks[i].encryptionType);
            obj["isOpen"] = scan.networks[i].isOpen;
        }

        std::string json;
        serializeJson(arr, json);
        sendJsonResponse(topic, json);
        return;
    }

    if (topic == "network.wifi.credentials.set")
    {
        const char *ssid = payloadObj["ssid"].is<const char *>() ? payloadObj["ssid"].as<const char *>() : nullptr;
        const char *password = payloadObj["password"].is<const char *>() ? payloadObj["password"].as<const char *>() : "";

        if (!ssid || strlen(ssid) == 0)
        {
            sendErrorResponse(topic, "INVALID_PAYLOAD");
            return;
        }

        Settings::saveNetworkConfig(std::string(ssid), std::string(password ? password : ""));
        Wifi::connectToNetwork(std::string(ssid), std::string(password ? password : ""));

        DynamicJsonDocument resp(64);
        resp["success"] = true;
        std::string json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    if (topic == "api.status.get")
    {
        auto ws = State::getWebsocketState();
        auto api = State::getApiState();
        AttraccessAuthConfig authCfg = Settings::getAttraccessAuthConfig();

        std::string status = "disconnected";
        if (ws.hostname.length() > 0 && ws.port > 0)
        {
            if (ws.connected)
            {
                status = api.authenticated ? "authenticated" : "connected";
            }
            else
            {
                status = "connecting_websocket";
            }
        }

        DynamicJsonDocument resp(192);
        resp["status"] = status;
        resp["hostname"] = ws.hostname;
        resp["port"] = ws.port;
        resp["useSSL"] = ws.useSSL;
        resp["deviceId"] = std::to_string(authCfg.readerId);

        std::string json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    if (topic == "api.configuration.set")
    {
        const char *hostname = payloadObj["hostname"].is<const char *>() ? payloadObj["hostname"].as<const char *>() : nullptr;
        uint16_t port = payloadObj["port"] | 0;
        bool useSSL = payloadObj["useSSL"].is<bool>() ? payloadObj["useSSL"].as<bool>() : false;

        if (!hostname || strlen(hostname) == 0 || port == 0)
        {
            sendErrorResponse(topic, "INVALID_PAYLOAD");
            return;
        }

        Settings::saveAttraccessApiConfig(std::string(hostname), port, useSSL);

        DynamicJsonDocument resp(64);
        resp["success"] = true;
        std::string json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    sendErrorResponse(topic, "UNKNOWN_TOPIC");
}

#endif
