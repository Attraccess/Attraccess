#pragma once

#include <Arduino.h>
#include "../cli/CLIService.hpp"
#include "../state/state.hpp"
#include "../logger/logger.hpp"

class SerialSetup
{
public:
    static void setup(CLIService *cliService);

private:
    static CLIService *cliService;
    static Logger logger;

    static void handleFirmwareVersion(const String &payload);
};