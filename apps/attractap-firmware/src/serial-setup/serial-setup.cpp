#include "serial-setup.hpp"

CLIService *SerialSetup::cliService = NULL;
Logger SerialSetup::logger = Logger("SerialSetup");

void SerialSetup::setup(CLIService *cliService)
{
    SerialSetup::cliService = cliService;

    cliService->registerCommandHandler("get.firmware.version", [](const String &payload)
                                       { handleFirmwareVersion(payload); });

    cliService->registerCommandHandler("system.reboot", [](const String &payload)
                                       {
                                           ESP.restart();
                                           SerialSetup::cliService->sendResponse("system.reboot", "rebooting"); });

    cliService->registerCommandHandler("set.log.level", [](const String &payload)
                                       {
                                           Logger::setLogLevel(payload);
                                           SerialSetup::cliService->sendResponse("set.log.level", "success"); });
}

void SerialSetup::handleFirmwareVersion(const String &payload)
{
    // Firmware version GET command should not have a payload
    if (payload.length() > 0)
    {
        cliService->sendResponse("get.firmware.version", "error unexpected_payload");
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
                cliService->sendResponse("get.firmware.version", "error invalid_version_format");
                return;
            }
        }

        cliService->sendResponse("get.firmware.version", version);
    }
    catch (...)
    {
        cliService->sendResponse("get.firmware.version", "error version_retrieval_failed");
    }
}
