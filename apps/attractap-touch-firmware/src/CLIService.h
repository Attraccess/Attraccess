#ifndef CLI_SERVICE_H
#define CLI_SERVICE_H

#include <Arduino.h>
#include <functional>
#include <map>
#include "WiFiServiceESP.h"
#include "AttraccessServiceESP.h"
#include "CommandParser.h"
#include "CommandExecutor.h"
#include <Preferences.h>

/**
 * Function type for command handlers
 * Takes payload as input and returns response string
 */
typedef std::function<String(const String &payload)> CommandHandler;

/**
 * Response formatter class responsible for formatting and sending responses
 */
class ResponseFormatter
{
public:
    /**
     * Format and send a successful response
     * @param action The action that was executed
     * @param answer The response data
     */
    static void formatResponse(const String &action, const String &answer);

    /**
     * Format and send an error response
     * @param errorType The type of error that occurred
     * @param message Optional error message
     */
    static void formatError(const String &errorType, const String &message = "");

private:
    static void sendLine(const String &line);
};

/**
 * Main CLI service class that coordinates command processing
 */
class CLIService
{
public:
    CLIService();
    ~CLIService();

    /**
     * Initialize the CLI service
     */
    void begin();

    /**
     * Update the CLI service - call this in the main loop
     */
    void update();

    /**
     * Register a command handler for extensibility
     * @param action The action string (e.g., "firmware.version")
     * @param handler The function to handle this command
     */
    void registerCommandHandler(const String &action, CommandHandler handler);

    /**
     * Set the WiFi service reference for WiFi-related commands
     * @param service Pointer to the WiFiServiceESP instance
     */
    void setWiFiServiceESP(WiFiServiceESP *service);

    /**
     * Set the Attraccess service reference for Attraccess-related commands
     * @param service Pointer to the AttraccessServiceESP instance
     */
    void setAttraccessServiceESP(AttraccessServiceESP *service);

private:
    CommandParser parser;
    CommandExecutor executor;
    String inputBuffer;

    // Error recovery state
    bool serialErrorRecovery;
    unsigned long lastSerialActivity;
    static const unsigned long SERIAL_TIMEOUT_MS = 5000;

    void processSerialInput();
    void handleCommand(const ParsedCommand &command);
    void sendResponse(const String &action, const String &response);
    void sendError(const String &errorType, const String &message = "");

    // Error handling and recovery
    void handleSerialError();
    void recoverFromSerialError();
    bool isSerialHealthy();
    void clearInputBuffer();

    // Built-in command handlers
    void registerBuiltinHandlers();
    String handleFirmwareVersion(const String &payload);
    String handleWiFiScan(const String &payload);
    String handleWiFiConnect(const String &payload);
    String handleWiFiStatus(const String &payload);
    String handleAttraccessStatus(const String &payload);
    String getEncryptionTypeString(wifi_auth_mode_t encType);
    String handleAttraccessConfiguration(const String &payload);

    // WiFi service reference
    WiFiServiceESP *wifiService;

    // Attraccess service reference
    AttraccessServiceESP *attraccessService;

    // Dependencies
    Preferences preferences;
};

#endif // CLI_SERVICE_H