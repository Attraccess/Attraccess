#pragma once

#include <Arduino.h>

class FirmwareUpdate
{
public:
    void setup();

    void start();
    void processChunk();

private:
    void loop();
};