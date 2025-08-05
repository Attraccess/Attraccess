#include "serial-setup.hpp"

CLIService *SerialSetup::cliService = NULL;
API *SerialSetup::api = NULL;

void SerialSetup::setup(CLIService *cliService, API *api)
{
    SerialSetup::cliService = cliService;
    SerialSetup::api = api;

    // Register firmware version handler
    cliService->registerCommandHandler("firmware.version", [](const String &payload) -> String
                                       { return handleFirmwareVersion(payload); });

    // Register WiFi scan handler
    cliService->registerCommandHandler("network.wifi.scan", [](const String &payload) -> String
                                       { return handleWiFiScan(payload); });

    // Register WiFi connect handler
    cliService->registerCommandHandler("network.wifi.credentials", [](const String &payload) -> String
                                       { return handleWiFiSetCredentials(payload); });

    // Register WiFi status handler
    cliService->registerCommandHandler("network.wifi.status", [](const String &payload) -> String
                                       { return handleWiFiStatus(payload); });

    // Register Attraccess status handler
    cliService->registerCommandHandler("attraccess.status", [](const String &payload) -> String
                                       { return handleAttraccessStatus(payload); });

    // Register Attraccess configuration handler
    cliService->registerCommandHandler("attraccess.configuration", [](const String &payload) -> String
                                       { return handleAttraccessConfiguration(payload); });
}

String SerialSetup::handleFirmwareVersion(const String &payload)
{
    // Firmware version GET command should not have a payload
    if (payload.length() > 0)
    {
        return "error unexpected_payload";
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
                return "error invalid_version_format";
            }
        }

        return version;
    }
    catch (...)
    {
        return "error version_retrieval_failed";
    }
}

String SerialSetup::handleWiFiScan(const String &payload)
{
    // GET command should not have a payload
    if (payload.length() > 0)
    {
        return "error unexpected_payload";
    }

    try
    {
        Wifi::startScan();

        uint32_t startTime = millis();
        uint32_t timeout = 60000; // 60 seconds
        while (Wifi::isScanning())
        {
            if (millis() - startTime > timeout)
            {
                return "error wifi_scan_timeout";
            }
            vTaskDelay(500 / portTICK_PERIOD_MS);
        }

        Wifi::WifiScanResult scanResult = Wifi::getKnownWifiNetworks();

        // Create JSON document using ArduinoJson
        JsonDocument doc;
        JsonArray networksArray = doc.to<JsonArray>();

        // Add each network to the JSON array
        for (uint8_t i = 0; i < scanResult.count; i++)
        {
            JsonObject network = networksArray.createNestedObject();
            network["ssid"] = scanResult.networks[i].ssid;
            network["encryption"] = wifiGetEncryptionTypeString(scanResult.networks[i].encryptionType);
            network["isOpen"] = scanResult.networks[i].isOpen;
        }

        // Serialize to string
        String result;
        serializeJson(doc, result);

        return result;
    }
    catch (...)
    {
        return "error wifi_scan_failed";
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

String SerialSetup::handleWiFiSetCredentials(const String &payload)
{
    // SET command requires a payload
    if (payload.length() == 0)
    {
        return "error wifi_set_credentials_missing_payload";
    }

    try
    {
        // Parse JSON payload using ArduinoJson
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (error)
        {
            return "error wifi_set_credentials_invalid_json_format";
        }

        // Extract SSID (required)
        if (!doc["ssid"].is<String>())
        {
            return "error wifi_set_credentials_missing_ssid_field";
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
            return "error wifi_set_credentials_empty_ssid";
        }

        NetworkConfig networkConfig = Settings::getNetworkConfig();
        if (!networkConfig.ssid.equals(ssid) || !networkConfig.password.equals(password))
        {
            Settings::saveNetworkConfig(ssid, password);
        }
        // Start connection
        Wifi::connectToNetwork(ssid, password);

        return "OK";
    }
    catch (...)
    {
        return "error wifi_set_credentials_connection_failed";
    }
}

String SerialSetup::handleWiFiStatus(const String &payload)
{
    // GET command should not have a payload
    if (payload.length() > 0)
    {
        return "error wifi_status_unexpected_payload";
    }

    try
    {
        // Create JSON response using ArduinoJson
        JsonDocument doc;

        // Determine status
        String status;
        if (Wifi::getState() == Wifi::WIFI_STATE_CONNECTING || Wifi::getState() == Wifi::WIFI_STATE_CONNECTED_WAITING_FOR_IP)
        {
            status = "connecting";
        }
        else if (Wifi::getState() == Wifi::WIFI_STATE_CONNECTED)
        {
            status = "connected";
        }
        else
        {
            status = "disconnected";
        }

        // Get SSID
        NetworkConfig credentials = Settings::getNetworkConfig();
        String ssid = credentials.ssid;
        if (ssid.length() == 0)
        {
            ssid = "none";
        }

        // Get IP address
        IPAddress ip = Wifi::getIPAddress();

        // Build JSON response
        doc["status"] = status;
        doc["ssid"] = ssid;
        doc["ip"] = ip.toString();

        // Serialize to string
        String result;
        serializeJson(doc, result);

        return result;
    }
    catch (...)
    {
        return "error wifi_status_retrieval_failed";
    }
}

String SerialSetup::handleAttraccessStatus(const String &payload)
{
    // GET command should not have a payload
    if (payload.length() > 0)
    {
        return "error unexpected_payload";
    }

    try
    {
        // Create JSON response using ArduinoJson
        JsonDocument doc;

        // TODO: implement
        String status = "disconnected";

        AttraccessApiConfig config = Settings::getAttraccessApiConfig();
        AttraccessAuthConfig authConfig = Settings::getAttraccessAuthConfig();

        // Build JSON response
        doc["hostname"] = config.hostname;
        doc["port"] = config.port;
        doc["status"] = status;
        doc["deviceId"] = authConfig.readerId;

        // Serialize to string
        String result;
        serializeJson(doc, result);

        return result;
    }
    catch (...)
    {
        return "error status_retrieval_failed";
    }
}

String SerialSetup::handleAttraccessConfiguration(const String &payload)
{
    // SET command requires a payload
    if (payload.length() == 0)
    {
        return "error missing_payload";
    }

    try
    {
        // Parse JSON payload using ArduinoJson
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (error)
        {
            return "error invalid_json_format";
        }

        if (!doc["hostname"].is<String>())
        {
            return "error missing_hostname_field";
        }

        String hostname = doc["hostname"].as<String>();

        if (!doc["port"].is<uint16_t>())
        {
            return "error missing_port_field";
        }

        uint16_t port = doc["port"].as<uint16_t>();

        bool useSSL = false;
        if (doc["useSSL"].is<bool>())
        {
            useSSL = doc["useSSL"].as<bool>();
        }

        Settings::saveAttraccessApiConfig(hostname, port, useSSL);

        return "success";
    }
    catch (...)
    {
        return "error connection_failed";
    }
}