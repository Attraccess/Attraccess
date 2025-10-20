#include <Arduino.h>
#include "esp_err.h"
#include "logger/logger.hpp"
#include <Wire.h>

#include "application/application.hpp"

Application application;

Logger mainLogger("Main");

void setup()
{
    Serial.begin(115200);
    delay(2000);

    // log firmware info
    mainLogger.info("Welcome to Attractap");
    mainLogger.infof("Firmware: %s, Variant: %s, Version: %s", FIRMWARE_FRIENDLY_NAME, FIRMWARE_VARIANT_FRIENDLY_NAME, FIRMWARE_VERSION);

    mainLogger.info("Serial initialized");

    Wire.begin(15, 7);
    // Prevent potential I2C stalls on touch controller reads
    Wire.setTimeOut(50);

    mainLogger.info("Attractap starting...");
    application.setup();
}

void loop()
{
    application.loop();
    // Cooperatively yield to other tasks and drivers
    delay(1);
}