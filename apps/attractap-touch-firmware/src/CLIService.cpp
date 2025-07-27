#include "CLIService.h"
#include "AttraccessService.h"
#include "CommandParser.h"
#include "CommandExecutor.h"
#include <ArduinoJson.h>

// Maximum input buffer size to prevent overflow
#define MAX_INPUT_BUFFER_SIZE 256

//=============================================================================
// ResponseFormatter Implementation
//=============================================================================

void ResponseFormatter::formatResponse(const String &action, const String &answer)
{
    // Validate inputs
    if (action.length() == 0)
    {
        formatError("internal_error", "empty_action_in_response");
        return;
    }

    if (answer.length() == 0)
    {
        formatError("internal_error", "empty_answer_in_response");
        return;
    }

    // Check for line breaks in response that could break protocol
    if (action.indexOf('\n') != -1 || action.indexOf('\r') != -1 ||
        answer.indexOf('\n') != -1 || answer.indexOf('\r') != -1)
    {
        formatError("internal_error", "invalid_characters_in_response");
        return;
    }

    String response = "RESP " + action + " " + answer;

    sendLine(response);
}

void ResponseFormatter::formatError(const String &errorType, const String &message)
{
    // Validate error type
    if (errorType.length() == 0)
    {
        sendLine("RESP error internal_error empty_error_type");
        return;
    }

    // Check for line breaks in error that could break protocol
    if (errorType.indexOf('\n') != -1 || errorType.indexOf('\r') != -1 ||
        (message.length() > 0 && (message.indexOf('\n') != -1 || message.indexOf('\r') != -1)))
    {
        sendLine("RESP error internal_error invalid_characters_in_error");
        return;
    }

    String response = "RESP error " + errorType;
    if (message.length() > 0)
    {
        response += " " + message;
    }

    sendLine(response);
}

void ResponseFormatter::sendLine(const String &line)
{
    // Final validation before sending
    if (line.length() == 0)
    {
        Serial.println("RESP error internal_error empty_response_line");
        Serial.flush();
        return;
    }

    try
    {
        Serial.println(line);
        Serial.flush(); // Ensure immediate transmission
    }
    catch (...)
    {
        // If serial write fails, there's not much we can do
        // The serial error handling in CLIService will detect this
    }
}

//=============================================================================
// CLIService Implementation
//=============================================================================

CLIService::CLIService()
{
    inputBuffer.reserve(MAX_INPUT_BUFFER_SIZE);
    serialErrorRecovery = false;
    lastSerialActivity = 0;
    wifiService = nullptr;
    attraccessService = nullptr;
}

CLIService::~CLIService()
{
    // Destructor
}

void CLIService::begin()
{
    // Serial is already initialized in main.cpp at 115200 baud
    Serial.println("CLI Service initialized");

    // Register built-in command handlers
    registerBuiltinHandlers();

    // Clear any existing serial input and reset error state
    clearInputBuffer();
    serialErrorRecovery = false;
    lastSerialActivity = millis();
}

void CLIService::update()
{
    // Check for serial communication health
    if (!isSerialHealthy())
    {
        handleSerialError();
        return;
    }

    // Process serial input if not in error recovery mode
    if (!serialErrorRecovery)
    {
        processSerialInput();
    }
    else
    {
        // Attempt recovery from serial error
        recoverFromSerialError();
    }
}

void CLIService::registerCommandHandler(const String &action, CommandHandler handler)
{
    executor.registerHandler(action, handler);
}

void CLIService::setWiFiService(WiFiService *service)
{
    wifiService = service;
}

void CLIService::setAttraccessService(AttraccessService *service)
{
    attraccessService = service;
}

void CLIService::processSerialInput()
{
    while (Serial.available())
    {
        char c = Serial.read();
        lastSerialActivity = millis(); // Update activity timestamp

        if (c == '\n' || c == '\r')
        {
            // End of command - process it
            if (inputBuffer.length() > 0)
            {
                try
                {
                    ParsedCommand command = parser.parse(inputBuffer);
                    handleCommand(command);
                }
                catch (...)
                {
                    // Catch any unexpected errors during command processing
                    ResponseFormatter::formatError("execution_error", "command_processing_failed");
                }
                clearInputBuffer(); // Clear buffer for next command
            }
        }
        else if (c >= 32 && c <= 126)
        { // Printable ASCII characters
            // Add character to buffer if there's space
            if (inputBuffer.length() < MAX_INPUT_BUFFER_SIZE - 1)
            {
                inputBuffer += c;
            }
            else
            {
                // Buffer overflow protection - clear buffer and send error
                clearInputBuffer();
                ResponseFormatter::formatError("buffer_overflow", "command_too_long");

                // Skip remaining characters until newline to prevent further overflow
                while (Serial.available() && Serial.peek() != '\n' && Serial.peek() != '\r')
                {
                    Serial.read();
                }
            }
        }
        else if (c < 32 && c != '\n' && c != '\r')
        {
            // Handle unexpected control characters
            ResponseFormatter::formatError("invalid_character", "non_printable_character_received");
            clearInputBuffer(); // Clear potentially corrupted buffer
        }
        // Ignore other characters (normal control characters like \t, etc.)
    }
}

void CLIService::handleCommand(const ParsedCommand &command)
{
    // Validate command structure
    if (!command.isValid)
    {
        ResponseFormatter::formatError(command.errorMessage);
        return;
    }

    // Additional validation for command execution
    if (command.action.length() == 0)
    {
        ResponseFormatter::formatError("empty_action");
        return;
    }

    try
    {
        String response = executor.execute(command);

        // Validate response from executor
        if (response.length() == 0)
        {
            ResponseFormatter::formatError("empty_response", "executor_returned_empty");
            return;
        }

        // Check if response is an error
        if (response.startsWith("error "))
        {
            String errorPart = response.substring(6); // Remove "error " prefix
            int spaceIndex = errorPart.indexOf(' ');
            if (spaceIndex != -1)
            {
                String errorType = errorPart.substring(0, spaceIndex);
                String errorMessage = errorPart.substring(spaceIndex + 1);
                ResponseFormatter::formatError(errorType, errorMessage);
            }
            else
            {
                ResponseFormatter::formatError(errorPart);
            }
        }
        else
        {
            ResponseFormatter::formatResponse(command.action, response);
        }
    }
    catch (const std::exception &e)
    {
        ResponseFormatter::formatError("execution_exception", "command_handler_threw_exception");
    }
    catch (...)
    {
        ResponseFormatter::formatError("execution_failed", "unknown_exception_in_handler");
    }
}

void CLIService::registerBuiltinHandlers()
{
    // Register firmware version handler
    registerCommandHandler("firmware.version", [this](const String &payload) -> String
                           { return handleFirmwareVersion(payload); });

    // Register WiFi scan handler
    registerCommandHandler("network.wifi.scan", [this](const String &payload) -> String
                           { return handleWiFiScan(payload); });

    // Register WiFi connect handler
    registerCommandHandler("network.wifi.credentials", [this](const String &payload) -> String
                           { return handleWiFiConnect(payload); });

    // Register WiFi status handler
    registerCommandHandler("network.wifi.status", [this](const String &payload) -> String
                           { return handleWiFiStatus(payload); });

    // Register Attraccess status handler
    registerCommandHandler("attraccess.status", [this](const String &payload) -> String
                           { return handleAttraccessStatus(payload); });

    // Register Attraccess configuration handler
    registerCommandHandler("attraccess.configuration", [this](const String &payload) -> String
                           { return handleAttraccessConfiguration(payload); });
}

String CLIService::handleFirmwareVersion(const String &payload)
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

//=============================================================================
// Error Handling and Recovery Implementation
//=============================================================================

void CLIService::handleSerialError()
{
    // Enter error recovery mode
    serialErrorRecovery = true;

    // Clear any corrupted input buffer
    clearInputBuffer();

    // Log error (if logging is available)
    Serial.println("CLI Service: Serial communication error detected, entering recovery mode");

    // Set recovery start time
    lastSerialActivity = millis();
}

void CLIService::recoverFromSerialError()
{
    // Check if enough time has passed for recovery attempt
    unsigned long currentTime = millis();
    if (currentTime - lastSerialActivity > 1000)
    { // Wait 1 second before recovery

        // Clear serial buffers
        while (Serial.available())
        {
            Serial.read(); // Flush input buffer
        }
        Serial.flush(); // Flush output buffer

        // Reset input buffer
        clearInputBuffer();

        // Test serial communication
        if (isSerialHealthy())
        {
            serialErrorRecovery = false;
            lastSerialActivity = currentTime;
            Serial.println("CLI Service: Serial communication recovered");
        }
        else
        {
            // If still not healthy, wait longer before next attempt
            lastSerialActivity = currentTime;
        }
    }
}

bool CLIService::isSerialHealthy()
{
    // Check if Serial is available and functioning
    if (!Serial)
    {
        return false;
    }

    // Check for timeout - if no activity for too long, consider unhealthy
    unsigned long currentTime = millis();
    if (serialErrorRecovery && (currentTime - lastSerialActivity > SERIAL_TIMEOUT_MS))
    {
        return false;
    }

    // Update last activity time if we have data available
    if (Serial.available())
    {
        lastSerialActivity = currentTime;
    }

    return true;
}

void CLIService::clearInputBuffer()
{
    inputBuffer = "";

    // Also clear any pending serial input
    while (Serial.available())
    {
        Serial.read();
    }
}

String CLIService::handleWiFiScan(const String &payload)
{
    // Validate that WiFi service is available
    if (!wifiService)
    {
        return "error wifi_service_unavailable";
    }

    // GET command should not have a payload
    if (payload.length() > 0)
    {
        return "error unexpected_payload";
    }

    try
    {
        // Check if already scanning
        if (wifiService->isScanning())
        {
            return "error scan_in_progress";
        }

        // Start the scan
        wifiService->scanNetworks();

        // Wait for scan to complete (with timeout)
        uint32_t startTime = millis();
        const uint32_t timeout = 10000; // 10 second timeout

        while (wifiService->isScanning() && (millis() - startTime) < timeout)
        {
            wifiService->update(); // Process WiFi events
            delay(100);            // Small delay to prevent blocking
        }

        // Check if scan completed successfully
        if (wifiService->isScanning())
        {
            return "error scan_timeout";
        }

        // Get scan results
        WiFiNetwork *networks = wifiService->getAvailableNetworks();
        uint8_t networkCount = wifiService->getNetworkCount();

        // Create JSON document using ArduinoJson
        JsonDocument doc;
        JsonArray networksArray = doc.to<JsonArray>();

        // Add each network to the JSON array
        for (uint8_t i = 0; i < networkCount; i++)
        {
            JsonObject network = networksArray.createNestedObject();
            network["ssid"] = networks[i].ssid;
            network["encryption"] = getEncryptionTypeString(networks[i].encryptionType);
            network["isOpen"] = networks[i].isOpen;
        }

        // Serialize to string
        String result;
        serializeJson(doc, result);

        return result;
    }
    catch (...)
    {
        return "error scan_failed";
    }
}

String CLIService::handleWiFiConnect(const String &payload)
{
    // Validate that WiFi service is available
    if (!wifiService)
    {
        return "error wifi_service_unavailable";
    }

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

        // Extract SSID (required)
        if (!doc["ssid"].is<String>())
        {
            return "error missing_ssid_field";
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
            return "error empty_ssid";
        }

        // Check if already connecting
        if (wifiService->isConnecting())
        {
            return "error already_connecting";
        }

        // Check if already connected to this network
        if (wifiService->isConnected() && wifiService->getConnectedSSID() == ssid)
        {
            return "already_connected";
        }

        // Start connection
        wifiService->connectToNetwork(ssid, password);

        // Wait for connection attempt to start (with timeout)
        uint32_t startTime = millis();
        const uint32_t timeout = 5000; // 5 second timeout for connection start

        while (!wifiService->isConnecting() && (millis() - startTime) < timeout)
        {
            wifiService->update(); // Process WiFi events
            delay(50);
        }

        if (!wifiService->isConnecting())
        {
            return "error connection_start_failed";
        }

        return "connecting";
    }
    catch (...)
    {
        return "error connection_failed";
    }
}

String CLIService::handleWiFiStatus(const String &payload)
{
    // Validate that WiFi service is available
    if (!wifiService)
    {
        return "error wifi_service_unavailable";
    }

    // GET command should not have a payload
    if (payload.length() > 0)
    {
        return "error unexpected_payload";
    }

    try
    {
        // Create JSON response using ArduinoJson
        JsonDocument doc;

        // Determine status
        String status;
        if (wifiService->isConnecting())
        {
            status = "connecting";
        }
        else if (wifiService->isConnected())
        {
            status = "connected";
        }
        else
        {
            status = "disconnected";
        }

        // Get SSID
        WiFiCredentials credentials = wifiService->getCurrentCredentials();
        String ssid = credentials.ssid;
        if (ssid.length() == 0)
        {
            ssid = "none";
        }

        // Get IP address
        String ip = wifiService->getLocalIP();
        if (ip.length() == 0 || ip == "0.0.0.0")
        {
            ip = "none";
        }

        // Build JSON response
        doc["status"] = status;
        doc["ssid"] = ssid;
        doc["ip"] = ip;

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

String CLIService::getEncryptionTypeString(wifi_auth_mode_t encType)
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

String CLIService::handleAttraccessStatus(const String &payload)
{
    // Validate that Attraccess service is available
    if (!attraccessService)
    {
        return "error attraccess_service_unavailable";
    }

    // GET command should not have a payload
    if (payload.length() > 0)
    {
        return "error unexpected_payload";
    }

    try
    {
        // Create JSON response using ArduinoJson
        JsonDocument doc;

        // Get connection state
        AttraccessService::ConnectionState state = attraccessService->getConnectionState();
        String status;

        switch (state)
        {
        case AttraccessService::DISCONNECTED:
            status = "disconnected";
            break;
        case AttraccessService::CONNECTING_TCP:
            status = "connecting_tcp";
            break;
        case AttraccessService::CONNECTING_WEBSOCKET:
            status = "connecting_websocket";
            break;
        case AttraccessService::CONNECTED:
            status = "connected";
            break;
        case AttraccessService::AUTHENTICATING:
            status = "authenticating";
            break;
        case AttraccessService::AUTHENTICATED:
            status = "authenticated";
            break;
        case AttraccessService::ERROR_FAILED:
            status = "error_failed";
            break;
        case AttraccessService::ERROR_TIMED_OUT:
            status = "error_timed_out";
            break;
        case AttraccessService::ERROR_INVALID_SERVER:
            status = "error_invalid_server";
            break;
        default:
            status = "unknown";
            break;
        }

        String hostname = attraccessService->getHostname();
        uint16_t port = attraccessService->getPort();
        String deviceId = attraccessService->getDeviceId();

        // Build JSON response
        doc["hostname"] = hostname;
        doc["port"] = port;
        doc["status"] = status;
        doc["deviceId"] = deviceId;

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

String CLIService::handleAttraccessConfiguration(const String &payload)
{
    if (!attraccessService)
    {
        return "error attraccess_service_unavailable";
    }

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

        preferences.begin("attraccess", false);
        preferences.putString("hostname", hostname);
        preferences.putShort("port", port);
        preferences.end();

        attraccessService->setServerConfig(hostname, port);

        return "success";
    }
    catch (...)
    {
        return "error connection_failed";
    }
}