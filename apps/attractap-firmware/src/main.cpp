#include <Arduino.h>
#include "esp_err.h"
#include "logger/logger.hpp"
#include <Wire.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "application/application.hpp"

SET_LOOP_TASK_STACK_SIZE(16 * 1024); // 16KB

Application application;

Logger mainLogger("Main");

#ifdef LOG_MEMORY_DEBUG
void logLoopStackUsage()
{
    static uint32_t lastPrint = 0;
    if (millis() - lastPrint < 1000)
        return;
    lastPrint = millis();

    UBaseType_t watermarkWords = uxTaskGetStackHighWaterMark(nullptr);
    Logger logger("Stack");
    logger.debugf("loopTask high watermark: %u words (~%u bytes)",
                  watermarkWords, watermarkWords * sizeof(StackType_t));
}
#endif

void i2cBusScan()
{
    mainLogger.info("=== I2C Bus Scan ===");
    int found = 0;
    for (uint8_t addr = 0x01; addr <= 0x7E; addr++)
    {
        Wire.beginTransmission(addr);
        uint8_t err = Wire.endTransmission();
        if (err == 0)
        {
            mainLogger.infof("  I2C device found at 0x%02X", addr);
            found++;
        }
        else if (err == 4)
        {
            mainLogger.infof("  I2C error at 0x%02X (err=4)", addr);
        }
    }
    mainLogger.infof("=== I2C Scan complete: %d device(s) found ===", found);
}

void setup()
{
    Serial.begin(115200);
    delay(2000);

    // log firmware info
    mainLogger.info("Welcome to Attractap");
    mainLogger.infof("Firmware: %s, Variant: %s, Version: %s", FIRMWARE_FRIENDLY_NAME, FIRMWARE_VARIANT_FRIENDLY_NAME, FIRMWARE_VERSION);

    mainLogger.info("Serial initialized");

#if defined(PIN_I2C_SDA) && defined(PIN_I2C_SCL)
    mainLogger.infof("I2C init: SDA=%d, SCL=%d", PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
#else
    mainLogger.info("I2C init: using default SDA/SCL pins");
    Wire.begin(SDA, SCL); // SDA, SCL
#endif

    // Prevent potential I2C stalls on touch controller reads
    Wire.setTimeOut(50);

    // Scan I2C bus to identify all connected devices
    i2cBusScan();

    mainLogger.info("Attractap starting...");
    application.setup();
}

void loop()
{
#ifdef LOG_MEMORY_DEBUG
    logLoopStackUsage();
#endif

    application.loop();
}
