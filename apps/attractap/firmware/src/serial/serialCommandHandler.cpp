#include "serialCommandHandler.hpp"

#include <ArduinoJson.h>
#include <lwip/inet.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/usb_serial_jtag.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <freertos/portable.h>

#include "../settings/settings.hpp"
#include "../network/wifi/wifi.hpp"
#include "../state/state.hpp"
#include "../utils.hpp"
#include "platform.hpp"

std::string SerialCommandHandler::inputBuffer = "";
Logger SerialCommandHandler::logger("SerialCmd");

void SerialCommandHandler::setup()
{
    logger.info("Serial command handler ready");
    inputBuffer.reserve(MAX_COMMAND_LENGTH);
}

void SerialCommandHandler::loop()
{
    // Non-blocking drain of the USB-Serial-JTAG RX buffer (driver installed in
    // main.cpp during startup; 0-tick timeout = don't wait for more bytes).
    uint8_t byte;
    while (usb_serial_jtag_read_bytes(&byte, 1, 0) == 1)
    {
        char c = static_cast<char>(byte);

        if (c == '\r')
        {
            continue;
        }

        if (c == '\n')
        {
            if (inputBuffer.length() > 0)
            {
                processLine(inputBuffer);
            }
            inputBuffer = "";
            continue;
        }

        if (inputBuffer.length() >= MAX_COMMAND_LENGTH)
        {
            logger.error("Serial command too long, clearing buffer");
            inputBuffer = "";
            continue;
        }

        inputBuffer += c;
    }
}

void SerialCommandHandler::processLine(const std::string &line)
{
    std::string trimmed = line;
    trimString(trimmed);

    // Search for "CMND" in the line to handle cases where garbage characters prefix the command
    size_t cmndIndex = trimmed.find("CMND");
    if (cmndIndex == std::string::npos)
    {
        logger.errorf("Invalid command format (no CMND): %s", trimmed.c_str());
        return;
    }

    // Extract everything from "CMND" onwards, removing any leading garbage
    trimmed = trimmed.substr(cmndIndex);
    trimString(trimmed);

    size_t firstSpace = trimmed.find(' ');
    if (firstSpace == std::string::npos)
    {
        logger.errorf("Invalid command format (no space): %s", trimmed.c_str());
        return;
    }

    std::string remainder = trimmed.substr(firstSpace + 1);
    trimString(remainder);

    size_t secondSpace = remainder.find(' ');
    std::string topic = (secondSpace != std::string::npos) ? remainder.substr(0, secondSpace) : remainder;
    std::string payload = (secondSpace != std::string::npos) ? remainder.substr(secondSpace + 1) : "";

    trimString(topic);
    trimString(payload);

    if (topic.length() == 0)
    {
        logger.errorf("Invalid command format (no topic): %s", trimmed.c_str());
        return;
    }

    logger.infof("Handling command: %s %s", topic.c_str(), payload.c_str());
    handleCommand(topic, payload);
}

bool SerialCommandHandler::pinIsSet()
{
    return Settings::getDeviceConfig().passCode != "0000";
}

bool SerialCommandHandler::validateNewCode(const char *code)
{
    if (!code)
    {
        return false;
    }
    size_t len = strlen(code);
    if (len != 4)
    {
        return false;
    }
    for (size_t i = 0; i < len; i++)
    {
        if (code[i] < '0' || code[i] > '9')
        {
            return false;
        }
    }
    return true;
}

bool SerialCommandHandler::ensureAuthorized(const char *codeFromPayload, std::string &errorOut)
{
    if (!pinIsSet())
    {
        return true;
    }

    if (!codeFromPayload)
    {
        errorOut = "MISSING_AUTH_CODE";
        return false;
    }

    if (Settings::getDeviceConfig().passCode != std::string(codeFromPayload))
    {
        errorOut = "INVALID_AUTH_CODE";
        return false;
    }

    return true;
}

std::string SerialCommandHandler::ipToString(const esp_ip4_addr_t &ip)
{
    char buf[16];
    snprintf(buf, sizeof(buf), IPSTR, IP2STR(&ip));
    return std::string(buf);
}

const char *SerialCommandHandler::encryptionTypeToString(wifi_auth_mode_t mode)
{
    switch (mode)
    {
    case WIFI_AUTH_OPEN:
        return "OPEN";
    case WIFI_AUTH_WEP:
        return "WEP";
    case WIFI_AUTH_WPA_PSK:
        return "WPA_PSK";
    case WIFI_AUTH_WPA2_PSK:
        return "WPA2_PSK";
    case WIFI_AUTH_WPA_WPA2_PSK:
        return "WPA_WPA2_PSK";
    case WIFI_AUTH_WPA2_ENTERPRISE:
        return "WPA2_ENTERPRISE";
    case WIFI_AUTH_WPA3_PSK:
        return "WPA3_PSK";
    case WIFI_AUTH_WPA2_WPA3_PSK:
        return "WPA2_WPA3_PSK";
    default:
        return "UNKNOWN";
    }
}

void SerialCommandHandler::handleCommand(const std::string &topic, const std::string &payload)
{
    bool hasPin = pinIsSet();

    StaticJsonDocument<512> payloadDoc;
    JsonObject payloadObj;
    if (payload.length() > 0)
    {
        auto err = deserializeJson(payloadDoc, payload);
        if (err)
        {
            sendErrorResponse(topic, "INVALID_PAYLOAD");
            return;
        }
        payloadObj = payloadDoc.as<JsonObject>();
    }
    else
    {
        payloadObj = payloadDoc.to<JsonObject>(); // empty object
    }

    if (topic == "debug.crash")
    {
        logger.error("debug.crash received - forcing panic for crash-report e2e test (ATT-474)");
        fflush(stdout);
        abort();
        return;
    }

    if (topic == "debug.stats")
    {
        // Per-task CPU / run-time stats dump (requires the run-stats config in
        // sdkconfig.debug). Diagnoses idle CPU burn (PERFORMANCE_ANALYSIS.md Q10).
#if CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS
        // Snapshot status records instead of passing storage to FreeRTOS's
        // unbounded formatter. A task created during the snapshot simply does
        // not appear in this report; it cannot overrun the status array.
        const UBaseType_t taskCount = uxTaskGetNumberOfTasks();
        TaskStatus_t *taskStatus = static_cast<TaskStatus_t *>(pvPortMalloc(taskCount * sizeof(TaskStatus_t)));
        if (!taskStatus)
        {
            logger.error("debug.stats unavailable: unable to allocate task snapshot");
            return;
        }

        configRUN_TIME_COUNTER_TYPE totalRunTime = 0;
        const UBaseType_t reportedTaskCount = uxTaskGetSystemState(taskStatus, taskCount, &totalRunTime);
        logger.info("--- FreeRTOS run-time stats ---");
        logger.info("Task                 Runtime        CPU");
        for (UBaseType_t i = 0; i < reportedTaskCount; i++)
        {
            const unsigned long percent = totalRunTime > 100
                                              ? static_cast<unsigned long>(taskStatus[i].ulRunTimeCounter / (totalRunTime / 100))
                                              : 0;
            char row[80];
            const int written = snprintf(row, sizeof(row), "%-20.20s %10lu %3lu%%",
                                         taskStatus[i].pcTaskName,
                                         static_cast<unsigned long>(taskStatus[i].ulRunTimeCounter),
                                         percent);
            if (written < 0 || static_cast<size_t>(written) >= sizeof(row))
            {
                logger.warn("debug.stats row truncated");
                continue;
            }
            logger.info(row);
        }
        logger.info("--- end stats ---");
        vPortFree(taskStatus);
#else
        logger.warn("debug.stats unavailable: CONFIG_FREERTOS_GENERATE_RUN_TIME_STATS not enabled (sdkconfig.debug)");
#endif
        return;
    }

    if (topic == "auth.status.get")
    {
        DynamicJsonDocument resp(64);
        resp["pinIsSet"] = hasPin;

        std::string json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    if (topic == "auth.code.set")
    {
        const char *newCode = payloadObj["newCode"].is<const char *>() ? payloadObj["newCode"].as<const char *>() : nullptr;
        const char *currentCode = payloadObj["currentCode"].is<const char *>() ? payloadObj["currentCode"].as<const char *>() : nullptr;

        if (!validateNewCode(newCode))
        {
            sendErrorResponse(topic, "INVALID_NEW_CODE");
            return;
        }

        if (hasPin)
        {
            std::string authError;
            if (!ensureAuthorized(currentCode, authError))
            {
                sendErrorResponse(topic, authError.c_str());
                return;
            }
        }

        Settings::setDevicePin(std::string(newCode));

        DynamicJsonDocument resp(64);
        resp["success"] = true;
        resp["pinIsSet"] = true;
        std::string json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    if (!hasPin)
    {
        sendErrorResponse(topic, "PIN_NOT_SET");
        return;
    }

    const char *authCode = payloadObj["authCode"].is<const char *>() ? payloadObj["authCode"].as<const char *>() : nullptr;
    std::string authError;
    if (!ensureAuthorized(authCode, authError))
    {
        sendErrorResponse(topic, authError.c_str());
        return;
    }

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

void SerialCommandHandler::sendJsonResponse(const std::string &topic, const std::string &payload)
{
    // Exact wire format "RESP <topic> <payload>\n" — the provisioning tooling parses it.
    printf("RESP %s %s\n", topic.c_str(), payload.c_str());
}

void SerialCommandHandler::sendErrorResponse(const std::string &topic, const char *error)
{
    DynamicJsonDocument resp(128);
    resp["error"] = error ? error : "UNKNOWN_ERROR";
    std::string json;
    serializeJson(resp, json);
    sendJsonResponse(topic, json);
}
