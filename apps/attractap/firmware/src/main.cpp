#include <cstdio>
#include "esp_err.h"
#include "nvs_flash.h"
#include "driver/usb_serial_jtag.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "application/application.hpp"
#include "logger/logger.hpp"
#include "platform.hpp"
#include "utils.hpp"

// Default I2C pins when a variant does not set PIN_NFC_I2C_* explicitly
// (was Wire.begin(SDA, SCL) with the board's Arduino defaults).
#ifndef PIN_NFC_I2C_SDA
#error "PIN_NFC_I2C_SDA/PIN_NFC_I2C_SCL must be defined by the variant"
#endif

Application application;

Logger mainLogger("Main");

#ifdef LOG_MEMORY_DEBUG
static void logLoopStackUsage()
{
    static uint32_t lastPrint = 0;
    if (millis() - lastPrint < 1000)
        return;
    lastPrint = millis();

    UBaseType_t watermarkWords = uxTaskGetStackHighWaterMark(nullptr);
    Logger logger("Stack");
    logger.debugf("main task high watermark: %u words (~%u bytes)",
                  watermarkWords, watermarkWords * sizeof(StackType_t));
}
#endif

extern "C" void app_main(void)
{
    // NVS backs all settings (the Arduino core used to initialize it implicitly).
    // The erase path only triggers on a truly incompatible/corrupt partition —
    // same recovery the Arduino core performed.
    esp_err_t nvsErr = nvs_flash_init();
    if (nvsErr == ESP_ERR_NVS_NO_FREE_PAGES || nvsErr == ESP_ERR_NVS_NEW_VERSION_FOUND)
    {
        ESP_ERROR_CHECK(nvs_flash_erase());
        nvsErr = nvs_flash_init();
    }
    ESP_ERROR_CHECK(nvsErr);

    // Console input (serialCommandHandler) reads from the USB-Serial-JTAG
    // driver; log output goes through stdout, which the VFS console routes to
    // the same port (CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG).
    usb_serial_jtag_driver_config_t usbConfig = {
        .tx_buffer_size = 1024,
        .rx_buffer_size = 512,
    };
    usb_serial_jtag_driver_install(&usbConfig);

    // Give the host time to enumerate USB before the first log lines
    // (parity with the old `Serial.begin(); delay(2000);` boot).
    delay(2000);

    // log firmware info
    mainLogger.info("Welcome to Attractap");
    mainLogger.infof("Firmware: %s, Variant: %s, Version: %s", FIRMWARE_FRIENDLY_NAME, FIRMWARE_VARIANT_FRIENDLY_NAME, FIRMWARE_VERSION);

    mainLogger.info("Console initialized");

    mainLogger.infof("I2C init: SDA=%d, SCL=%d", PIN_NFC_I2C_SDA, PIN_NFC_I2C_SCL);
    recoverI2CBus(PIN_NFC_I2C_SDA, PIN_NFC_I2C_SCL);
    if (!initSharedI2CBus(PIN_NFC_I2C_SDA, PIN_NFC_I2C_SCL))
    {
        mainLogger.error("Shared I2C bus init failed");
    }

    // Serialize all shared-bus I2C traffic (PN532 / GT911 / IO expander) across
    // tasks — must exist before application.setup() spawns any task (ATT-554).
    I2CBusLock::init();

    mainLogger.info("Attractap starting...");
    application.setup();

    // The main task is the old Arduino loopTask: 16 KB stack, pinned to core 1
    // (CONFIG_ESP_MAIN_TASK_STACK_SIZE / CONFIG_ESP_MAIN_TASK_AFFINITY_CPU1).
    for (;;)
    {
#ifdef LOG_MEMORY_DEBUG
        logLoopStackUsage();
#endif
        application.loop();
    }
}
