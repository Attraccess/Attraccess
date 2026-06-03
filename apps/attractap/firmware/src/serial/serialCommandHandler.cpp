#include "serialCommandHandler.hpp"

#include <ArduinoJson.h>
#include <lwip/inet.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#ifdef BENCH_FREEZE_REPRO
#include <cstdlib>
#include "esp_heap_caps.h"
#endif

#include "../settings/settings.hpp"
#include "../network/wifi/wifi.hpp"
#include "../state/state.hpp"

String SerialCommandHandler::inputBuffer = "";
Logger SerialCommandHandler::logger("SerialCmd");

#ifdef BENCH_FREEZE_REPRO
std::function<void()> SerialCommandHandler::dropWebsocketHook = nullptr;

static volatile uint32_t benchStackSink = 0;

static uint32_t benchRecurse(uint32_t depth)
{
    volatile uint8_t frame[256];
    frame[0] = static_cast<uint8_t>(depth);
    benchStackSink += frame[0];
    return benchRecurse(depth + 1) + frame[0];
}
#endif

void SerialCommandHandler::setup()
{
    logger.info("Serial command handler ready");
    inputBuffer.reserve(MAX_COMMAND_LENGTH);
}

void SerialCommandHandler::loop()
{
    while (Serial.available())
    {
        char c = static_cast<char>(Serial.read());

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

void SerialCommandHandler::processLine(const String &line)
{
    String trimmed = line;
    trimmed.trim();

    // Search for "CMND" in the line to handle cases where garbage characters prefix the command
    int cmndIndex = trimmed.indexOf("CMND");
    if (cmndIndex < 0)
    {
        logger.errorf("Invalid command format (no CMND): %s", trimmed.c_str());
        return;
    }

    // Extract everything from "CMND" onwards, removing any leading garbage
    trimmed = trimmed.substring(cmndIndex);
    trimmed.trim();

    int firstSpace = trimmed.indexOf(' ');
    if (firstSpace < 0)
    {
        logger.errorf("Invalid command format (no space): %s", trimmed.c_str());
        return;
    }

    String remainder = trimmed.substring(firstSpace + 1);
    remainder.trim();

    int secondSpace = remainder.indexOf(' ');
    String topic = (secondSpace >= 0) ? remainder.substring(0, secondSpace) : remainder;
    String payload = (secondSpace >= 0) ? remainder.substring(secondSpace + 1) : "";

    topic.trim();
    payload.trim();

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

bool SerialCommandHandler::ensureAuthorized(const char *codeFromPayload, String &errorOut)
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

    if (Settings::getDeviceConfig().passCode != String(codeFromPayload))
    {
        errorOut = "INVALID_AUTH_CODE";
        return false;
    }

    return true;
}

String SerialCommandHandler::ipToString(const esp_ip4_addr_t &ip)
{
    char buf[16];
    snprintf(buf, sizeof(buf), IPSTR, IP2STR(&ip));
    return String(buf);
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

void SerialCommandHandler::handleCommand(const String &topic, const String &payload)
{
#ifdef BENCH_FREEZE_REPRO
    if (handleBenchFaultCommand(topic))
    {
        return;
    }
#endif

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

    if (topic == "auth.status.get")
    {
        DynamicJsonDocument resp(64);
        resp["pinIsSet"] = hasPin;

        String json;
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
            String authError;
            if (!ensureAuthorized(currentCode, authError))
            {
                sendErrorResponse(topic, authError.c_str());
                return;
            }
        }

        Settings::setDevicePin(String(newCode));

        DynamicJsonDocument resp(64);
        resp["success"] = true;
        resp["pinIsSet"] = true;
        String json;
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
    String authError;
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

        String json;
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

        String json;
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

        Settings::saveNetworkConfig(String(ssid), String(password ? password : ""));
        Wifi::connectToNetwork(String(ssid), String(password ? password : ""));

        DynamicJsonDocument resp(64);
        resp["success"] = true;
        String json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    if (topic == "api.status.get")
    {
        auto ws = State::getWebsocketState();
        auto api = State::getApiState();
        AttraccessAuthConfig authCfg = Settings::getAttraccessAuthConfig();

        String status = "disconnected";
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
        resp["deviceId"] = String(authCfg.readerId);

        String json;
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

        Settings::saveAttraccessApiConfig(String(hostname), port, useSSL);

        DynamicJsonDocument resp(64);
        resp["success"] = true;
        String json;
        serializeJson(resp, json);
        sendJsonResponse(topic, json);
        return;
    }

    sendErrorResponse(topic, "UNKNOWN_TOPIC");
}

void SerialCommandHandler::sendJsonResponse(const String &topic, const String &payload)
{
    Serial.print("RESP ");
    Serial.print(topic);
    Serial.print(" ");
    Serial.println(payload);
}

void SerialCommandHandler::sendErrorResponse(const String &topic, const char *error)
{
    DynamicJsonDocument resp(128);
    resp["error"] = error ? error : "UNKNOWN_ERROR";
    String json;
    serializeJson(resp, json);
    sendJsonResponse(topic, json);
}

#ifdef BENCH_FREEZE_REPRO
void SerialCommandHandler::setDropWebsocketHook(std::function<void()> hook)
{
    dropWebsocketHook = hook;
}

bool SerialCommandHandler::handleBenchFaultCommand(const String &topic)
{
    if (topic != "crash_heap" && topic != "crash_null" && topic != "crash_abort" &&
        topic != "crash_stack" && topic != "hang_loop" && topic != "hang_wdt" &&
        topic != "drop_ws")
    {
        return false;
    }

    logger.errorf("BENCH fault injection requested: %s", topic.c_str());
    DynamicJsonDocument resp(96);
    resp["fault"] = topic;
    resp["triggered"] = true;
    String json;
    serializeJson(resp, json);
    sendJsonResponse(topic, json);
    Serial.flush();

    if (topic == "drop_ws")
    {
        if (dropWebsocketHook)
        {
            dropWebsocketHook();
        }
        else
        {
            logger.error("drop_ws: no websocket hook registered");
        }
        return true;
    }

    if (topic == "crash_heap")
    {
        volatile uint8_t *buf = static_cast<uint8_t *>(malloc(16));
        if (buf)
        {
            for (size_t i = 0; i < 64; i++)
            {
                buf[i] = 0xAB;
            }
            heap_caps_check_integrity_all(true);
        }
        return true;
    }

    if (topic == "crash_null")
    {
        volatile uint32_t *p = nullptr;
        *p = 0xDEADBEEF;
        return true;
    }

    if (topic == "crash_abort")
    {
        abort();
    }

    if (topic == "crash_stack")
    {
        benchStackSink += benchRecurse(0);
        return true;
    }

    if (topic == "hang_loop")
    {
        while (true)
        {
            delay(1000);
        }
    }

    if (topic == "hang_wdt")
    {
        portDISABLE_INTERRUPTS();
        while (true)
        {
        }
    }

    return true;
}
#endif
