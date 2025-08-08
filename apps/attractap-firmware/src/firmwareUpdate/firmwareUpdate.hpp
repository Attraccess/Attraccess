#pragma once

#include <Arduino.h>
#include "../logger/logger.hpp"

class FirmwareUpdate
{
public:
    FirmwareUpdate() : logger("FirmwareUpdate") {}

    void setup();

    void start();
    void processChunk();

private:
    void loop();
    Logger logger;
};