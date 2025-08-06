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