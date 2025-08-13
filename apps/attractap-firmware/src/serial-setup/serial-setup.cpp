#include "serial-setup.hpp"
#include "../keypad/keypad.hpp"
#include "../keypad/keypad_config.hpp"
#include "../state/state.hpp"
#include "../network/wifi/wifi.hpp"
#if KEYPAD == KEYPAD_I2C_MPR121
#include "../keypad/variations/mpr121/mpr121.hpp"
#endif
#include "../settings/settings.hpp"
#include <lwip/ip4_addr.h>

// Helper to convert esp_ip4_addr_t to dotted string
static String ipToString(const esp_ip4_addr_t &ip)
{
    char buf[16];
    ip4addr_ntoa_r(reinterpret_cast<const ip4_addr_t *>(&ip), buf, sizeof(buf));
    return String(buf);
}

CLIService *SerialSetup::cliService = NULL;
API *SerialSetup::api = NULL;
Websocket *SerialSetup::websocket = NULL;
TaskHandle_t SerialSetup::taskHandle = nullptr;

void SerialSetup::setup(CLIService *cliService, API *api, Websocket *websocket)
{
    SerialSetup::cliService = cliService;
    SerialSetup::api = api;
    SerialSetup::websocket = websocket;

    // Register firmware version handler
    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_GET, "firmware.version", [](const String &payload)
                                       { handleFirmwareVersion(payload); });

    // Register Attraccess status handler
    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_GET, "attraccess.status", [](const String &payload)
                                       { handleAttraccessStatus(payload); });

    // Register Attraccess configuration handler
    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_SET, "attraccess.configuration", [](const String &payload)
                                       { handleAttraccessConfiguration(payload); });

    // Register WiFi scan handler (non-blocking; results sent from background task)
    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_GET, "network.wifi.scan", [](const String &payload)
                                       { handleWiFiScan(payload); });

    // Register WiFi connect handler
    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_SET, "network.wifi.credentials", [](const String &payload)
                                       { handleWiFiConnect(payload); });

    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_GET, "network.status", [](const String &payload)
                                       { handleNetworkStatus(payload); });

    // register reboot handler
    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_SET, "system.reboot", [](const String &payload)
                                       {
                                           ESP.restart();
                                           SerialSetup::cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "system.reboot", "rebooting"); });

    // set log level
    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_SET, "log.level", [](const String &payload)
                                       {
                                           Logger::setLogLevel(payload);
                                           SerialSetup::cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "log.level", "success"); });

    // MPR121 calibration helpers (only when MPR121 is compiled in)
#if KEYPAD == KEYPAD_I2C_MPR121
    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_SET, "keypad.mpr121.thresholds", [](const String &payload)
                                       {
                                           uint8_t t = 0, r = 0;
                                           int sep = payload.indexOf(' ');
                                           if (sep > 0) {
                                               t = (uint8_t) payload.substring(0, sep).toInt();
                                               r = (uint8_t) payload.substring(sep + 1).toInt();
                                           }
                                           if (t == 0 || r == 0) { SerialSetup::cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "keypad.mpr121.thresholds", "error invalid_thresholds"); return; }
                                           // Persist thresholds even if keypad inactive
                                           Settings::saveMpr121Thresholds(t, r);
                                           extern Keypad keypad; // declared in main.cpp
                                           MPR121* m = static_cast<MPR121*>(keypad.getImplementation());
                                           if (m) {
                                               m->setThresholds(t, r);
                                               SerialSetup::cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "keypad.mpr121.thresholds", String("ok applied ") + t + " " + r);
                                           } else {
                                               SerialSetup::cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "keypad.mpr121.thresholds", String("ok saved ") + t + " " + r + " (reboot to enable)");
                                           } });

    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_GET, "keypad.mpr121.dump", [](const String &payload)
                                       {
                                           uint8_t t=0,r=0; Settings::getMpr121Thresholds(t,r);
                                           extern Keypad keypad; // declared in main.cpp
                                           MPR121* m = static_cast<MPR121*>(keypad.getImplementation());
                                           String out;
                                           if (m) {
                                               uint16_t base[12]; uint16_t filt[12];
                                               m->getBaselineAndFiltered(base, filt);
                                               out = "{";
                                               for (uint8_t i=0;i<12;i++){ out += "\"" + String(i) + "\":[" + String(base[i]) + "," + String(filt[i]) + "]"; if(i<11) out += ","; }
                                               out += "}";
                                           } else {
                                               out = String("{\"note\":\"inactive\",\"thresholds\":[") + t + "," + r + "]}";
                                           }
                                           SerialSetup::cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "keypad.mpr121.dump", out); });
#endif

    // Keypad status
    cliService->registerCommandHandler(CLI_SERVICE::CLI_COMMAND_GET, "keypad.status", [](const String &payload)
                                       {
                                           String out = "{";
#if KEYPAD == KEYPAD_I2C_MPR121
                                           out += "\"configured\":true,";
                                           uint8_t t=0,r=0; Settings::getMpr121Thresholds(t,r);
                                           extern Keypad keypad; MPR121* m = static_cast<MPR121*>(keypad.getImplementation());
                                           if (m) { String s; m->getStatusJson(s,t,r); out += "\"detail\":" + s; }
                                           else { out += "\"detail\":{\"type\":\"MPR121\",\"needsConfig\":true}"; }
#elif KEYPAD == KEYPAD_I2C_FOLIO
                                           out += "\"configured\":true,\"detail\":{\"type\":\"FOLIO\"}";
#else
                                           out += "\"configured\":false";
#endif
                                           out += "}";
                                           SerialSetup::cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "keypad.status", out); });

    startBackgroundTask();
}

void SerialSetup::handleFirmwareVersion(const String &payload)
{
    // Firmware version GET command should not have a payload
    if (payload.length() > 0)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "firmware.version", "error unexpected_payload");
        return;
    }

    try
    {
        // Create a comprehensive version string from build configuration
        String fullVersionString;
        String name = String(FIRMWARE_NAME);
        String variant = String(FIRMWARE_VARIANT);
        String version = String(FIRMWARE_VERSION);
        fullVersionString += name + "--" + variant + "--" + version;

        // Ensure version string doesn't contain invalid characters
        for (int i = 0; i < version.length(); i++)
        {
            char c = version.charAt(i);
            if (c < 32 || c > 126)
            {
                cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "firmware.version", "error invalid_version_format");
                return;
            }
        }

        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "firmware.version", version);
    }
    catch (...)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "firmware.version", "error version_retrieval_failed");
    }
}

String SerialSetup::wifiGetEncryptionTypeString(wifi_auth_mode_t encType)
{
    switch (encType)
    {
    case WIFI_AUTH_OPEN:
        return "Open";
    case WIFI_AUTH_WEP:
        return "WEP";
    case WIFI_AUTH_WPA_PSK:
        return "WPA";
    case WIFI_AUTH_WPA2_PSK:
        return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK:
        return "WPA/WPA2";
    case WIFI_AUTH_WPA2_ENTERPRISE:
        return "WPA2 Enterprise";
    case WIFI_AUTH_WPA3_PSK:
        return "WPA3";
    case WIFI_AUTH_WPA2_WPA3_PSK:
        return "WPA2/WPA3";
    case WIFI_AUTH_WAPI_PSK:
        return "WAPI";
    default:
        return "Unknown";
    }
}

void SerialSetup::handleAttraccessStatus(const String &payload)
{
    // GET command should not have a payload
    if (payload.length() > 0)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "attraccess.status", "error unexpected_payload");
        return;
    }

    try
    {
        // Create JSON response using ArduinoJson
        JsonDocument doc;

        String status = "disconnected";

        AttraccessApiConfig config = Settings::getAttraccessApiConfig();
        AttraccessAuthConfig authConfig = Settings::getAttraccessAuthConfig();

        State::NetworkState networkState = State::getNetworkState();
        State::ApiState apiState = State::getApiState();
        State::WebsocketState websocketState = State::getWebsocketState();

        if (websocketState.connected)
        {
            status = "connected";
        }

        if ((networkState.wifi_connected || networkState.ethernet_connected) && websocketState.connected && apiState.authenticated)
        {
            status = "authenticated";
        }

        // Build JSON response
        doc["hostname"] = config.hostname;
        doc["port"] = config.port;
        doc["status"] = status;
        doc["deviceId"] = authConfig.readerId;

        // Serialize to string
        String result;
        serializeJson(doc, result);
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "attraccess.status", result);
    }
    catch (...)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "attraccess.status", "error status_retrieval_failed");
    }
}

void SerialSetup::handleAttraccessConfiguration(const String &payload)
{
    // SET command requires a payload
    if (payload.length() == 0)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "attraccess.configuration", "error missing_payload");
        return;
    }

    try
    {
        // Parse JSON payload using ArduinoJson
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (error)
        {
            cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "attraccess.configuration", "error invalid_json_format");
            return;
        }

        if (!doc["hostname"].is<String>())
        {
            cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "attraccess.configuration", "error missing_hostname_field");
            return;
        }

        String hostname = doc["hostname"].as<String>();

        if (!doc["port"].is<uint16_t>())
        {
            cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "attraccess.configuration", "error missing_port_field");
            return;
        }

        uint16_t port = doc["port"].as<uint16_t>();

        bool useSSL = false;
        if (doc["useSSL"].is<bool>())
        {
            useSSL = doc["useSSL"].as<bool>();
        }

        Settings::saveAttraccessApiConfig(hostname, port, useSSL);

        websocket->connectWebSocket();

        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "attraccess.configuration", "success");
    }
    catch (...)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "attraccess.configuration", "error connection_failed");
    }
}

void SerialSetup::handleWiFiScan(const String &payload)
{
    // GET command should not have a payload
    if (payload.length() > 0)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "network.wifi.scan", "error unexpected_payload");
        return;
    }

    Wifi::startScan();
}

String SerialSetup::getEncryptionTypeString(wifi_auth_mode_t encType)
{
    switch (encType)
    {
    case WIFI_AUTH_OPEN:
        return "Open";
    case WIFI_AUTH_WEP:
        return "WEP";
    case WIFI_AUTH_WPA_PSK:
        return "WPA";
    case WIFI_AUTH_WPA2_PSK:
        return "WPA2";
    case WIFI_AUTH_WPA_WPA2_PSK:
        return "WPA/WPA2";
    case WIFI_AUTH_WPA2_ENTERPRISE:
        return "WPA2 Enterprise";
    case WIFI_AUTH_WPA3_PSK:
        return "WPA3";
    case WIFI_AUTH_WPA2_WPA3_PSK:
        return "WPA2/WPA3";
    case WIFI_AUTH_WAPI_PSK:
        return "WAPI";
    default:
        return "Unknown";
    }
}

void SerialSetup::onWifiScanDone(WifiNetwork *networks, uint8_t count)
{
    JsonDocument doc;
    JsonArray networksArray = doc.to<JsonArray>();

    // Add each network to the JSON array
    for (uint8_t i = 0; i < count; i++)
    {
        JsonObject network = networksArray.add<JsonObject>();
        network["ssid"] = networks[i].ssid;
        network["encryption"] = getEncryptionTypeString(networks[i].encryptionType);
        network["isOpen"] = networks[i].isOpen;
    }

    // Serialize to string
    String result;
    serializeJson(doc, result);

    cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "network.wifi.scan", result);
}

void SerialSetup::handleWiFiConnect(const String &payload)
{
    // SET command requires a payload
    if (payload.length() == 0)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "network.wifi.credentials", "error missing_payload");
        return;
    }

    try
    {
        // Parse JSON payload using ArduinoJson
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (error)
        {
            cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "network.wifi.credentials", "error invalid_json_format");
            return;
        }

        // Extract SSID (required)
        if (!doc["ssid"].is<String>())
        {
            cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "network.wifi.credentials", "error missing_ssid_field");
            return;
        }

        String ssid = doc["ssid"].as<String>();

        // Extract password (optional)
        String password = "";
        if (doc["password"].is<String>())
        {
            password = doc["password"].as<String>();
        }

        // Validate SSID
        if (ssid.length() == 0)
        {
            cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "network.wifi.credentials", "error empty_ssid");
            return;
        }

        Settings::saveNetworkConfig(ssid, password);

        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "network.wifi.credentials", "success");
    }
    catch (...)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_SET, "network.wifi.credentials", "error connection_failed");
    }
}

void SerialSetup::startBackgroundTask()
{
    if (taskHandle != nullptr)
    {
        return;
    }
    xTaskCreate(&SerialSetup::taskFn, "serial_setup_task", 4096, nullptr, TASK_PRIORITY_SERIAL_SETUP, &taskHandle);
}

void SerialSetup::taskFn(void *param)
{
    while (true)
    {
        processWifiEvents();
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

void SerialSetup::processWifiEvents()
{
    State::WifiEvent ev;
    while (State::getNextWifiEvent(ev))
    {
        if (ev.type == State::WIFI_EVENT_SCAN_DONE)
        {
            // Read scan results from Wifi and send response
            auto results = Wifi::getKnownWifiNetworks();

            JsonDocument doc;
            JsonArray networksArray = doc.to<JsonArray>();
            for (uint8_t i = 0; i < results.count; i++)
            {
                JsonObject network = networksArray.add<JsonObject>();
                network["ssid"] = results.networks[i].ssid;
                network["encryption"] = getEncryptionTypeString(results.networks[i].encryptionType);
                network["isOpen"] = results.networks[i].isOpen;
            }

            String out;
            serializeJson(doc, out);
            cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "network.wifi.scan", out);
        }
    }
}

void SerialSetup::handleNetworkStatus(const String &payload)
{
    // GET command should not have a payload
    if (payload.length() > 0)
    {
        cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "network.status", "error unexpected_payload");
        return;
    }

    State::NetworkState state = State::getNetworkState();

    JsonDocument doc;
    doc["wifi_connected"] = state.wifi_connected;
    doc["wifi_ssid"] = state.wifi_ssid;
    doc["wifi_ip"] = ipToString(state.wifi_ip);
    doc["ethernet_connected"] = state.ethernet_connected;
    doc["ethernet_ip"] = ipToString(state.ethernet_ip);

    String out;
    serializeJson(doc, out);
    cliService->sendResponse(CLI_SERVICE::CLI_COMMAND_GET, "network.status", out);
}