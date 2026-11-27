#include <cstdio>
#include "esp_err.h"
#include "nvs_flash.h"
#ifndef ATTRACTAP_SECURE_PROFILE
#include "serial/console_io.hpp"
#endif
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "application/application.hpp"
#ifdef ATTRACTAP_BLE_BRIDGE
#include "bridge/bridge.hpp"
#include "bridge/no_nfc.hpp"
#else
#include "rfid/rfid.hpp"
#endif
#include "websocket/websocket.hpp"
#ifdef DEMO_MODE
#include "api/demo/websocket.hpp"
#else
#include "api/security/reader_link.hpp"
#endif
#include "api/security/build_profile.hpp"
#include "api/conversion/conversion_migration.hpp"
#include "logger/logger.hpp"
#include "platform.hpp"
#include "utils.hpp"
#ifdef ATTRACTAP_UI_SELFTEST
#include "selftest/ui_selftest.hpp"
#endif
#ifdef LOG_MEMORY_DEBUG
#include "esp_heap_caps.h"
#ifdef HAS_LVGL_DISPLAY
#include <lvgl.h>
#endif
#endif

#ifdef ATTRACTAP_BLE_BRIDGE
NoNfc nfc;
#else
// Default I2C pins when a variant does not set PIN_NFC_I2C_* explicitly
// (was Wire.begin(SDA, SCL) with the board's Arduino defaults).
#ifndef PIN_NFC_I2C_SDA
#error "PIN_NFC_I2C_SDA/PIN_NFC_I2C_SCL must be defined by the variant"
#endif

NFC nfc;
#endif
#ifdef DEMO_MODE
DemoWebsocket websocket;
API api(websocket);
#else
Websocket websocket;
// Pairing and the TLS 1.3 session run over the one WebSocket.
ReaderLink readerLink(websocket, {
#ifdef HAS_LVGL_DISPLAY
                                     false,
#else
                                     true,
#endif
                                     {FIRMWARE_NAME, FIRMWARE_VARIANT, FIRMWARE_VERSION}});
API api(readerLink);
#endif
Application application(nfc, api);

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
    // The UI tasks and the LVGL pool (ATT-1187): LvglTask draws, the main task dispatches inbound messages on
    // paired readers, rl_tls runs the TLS session. websocket_task (esp_websocket_client) parses inbound
    // messages on its 16 KB internal stack; ws_conn, ws_tx and NetworkTask run on PSRAM stacks.
    for (const char *name : {"LvglTask", "rl_tls", "websocket_task", "ws_conn", "ws_tx", "NetworkTask"})
    {
        TaskHandle_t handle = xTaskGetHandle(name);
        if (handle)
            logger.debugf("%s high watermark: ~%u bytes free", name,
                          (unsigned)(uxTaskGetStackHighWaterMark(handle) * sizeof(StackType_t)));
    }
#ifdef HAS_LVGL_DISPLAY
    lv_lock();
    lv_mem_monitor_t pool;
    lv_mem_monitor(&pool);
    lv_unlock();
    logger.debugf("lv pool: total %u free %u biggest %u max_used %u frag %u%%", (unsigned)pool.total_size,
                  (unsigned)pool.free_size, (unsigned)pool.free_biggest_size, (unsigned)pool.max_used,
                  (unsigned)pool.frag_pct);
#endif
}
#endif

extern "C" void app_main(void)
{
    // NVS backs all settings (the Arduino core used to initialize it implicitly). The erase path only triggers on a
    // truly incompatible/corrupt partition (same recovery the Arduino core performed), and never while a "Secure this
    // reader" conversion's data waits in the staging region. On the secure app's first boot after a conversion this
    // also migrates the staged settings into encrypted NVS (step 8, src/api/conversion/conversion_migration.hpp).
    const esp_err_t nvsErr = static_cast<esp_err_t>(ConversionMigration::initNvs());
    if (nvsErr != ESP_OK)
    {
        // Not fatal while staged conversion data is kept: the reader stays up instead of rebooting in a loop.
        mainLogger.errorf("NVS init failed: %s", esp_err_to_name(nvsErr));
        if (ConversionMigration::nvsErasePermitted())
        {
            ESP_ERROR_CHECK(nvsErr);
        }
    }

#ifndef ATTRACTAP_SECURE_PROFILE
    // Console input (serialCommandHandler) reads from the USB-Serial-JTAG
    // driver (UART0 on the BLE bridge); log output goes through stdout, which
    // the VFS console routes to the same port. The secure profile has no
    // console: its commands arrive only over the Bluetooth setup (src/bt_setup).
    console_io::install();

    // Give the host time to enumerate USB before the first log lines
    // (parity with the old `Serial.begin(); delay(2000);` boot).
    delay(2000);
#endif

    // log firmware info
    mainLogger.info("Welcome to Attractap");
    mainLogger.infof("Firmware: %s, Variant: %s, Version: %s", FIRMWARE_FRIENDLY_NAME, FIRMWARE_VARIANT_FRIENDLY_NAME, FIRMWARE_VERSION);

    // Referencing the marker keeps it in the image: secure_packaging.py and SecureImageService look for it.
    if (BuildProfile::secureBuild())
    {
        mainLogger.infof("Secure profile: %s", BuildProfile::secureProfileMarker());
    }

    mainLogger.info("Console initialized");

#ifdef ATTRACTAP_BLE_BRIDGE
    // LEDs and button first, so the power LED shows the firmware runs.
    bridge::start([] {
        switch (api.bleActivity())
        {
        case BleProxy::Activity::Connected: return bridge::BleActivity::Connected;
        case BleProxy::Activity::Scanning: return bridge::BleActivity::Scanning;
        default: return bridge::BleActivity::Idle;
        }
    });
#else
    mainLogger.infof("I2C init: SDA=%d, SCL=%d", PIN_NFC_I2C_SDA, PIN_NFC_I2C_SCL);
    if (!recoverI2CBus(PIN_NFC_I2C_SDA, PIN_NFC_I2C_SCL))
    {
        mainLogger.error("I2C bus still held low after recovery; a stuck slave releases it only on a power cycle");
    }
    if (!initSharedI2CBus(PIN_NFC_I2C_SDA, PIN_NFC_I2C_SCL))
    {
        mainLogger.error("Shared I2C bus init failed");
    }

    // Serialize all shared-bus I2C traffic (PN532 / GT911 / IO expander) across
    // tasks — must exist before application.setup() spawns any task (ATT-554).
    I2CBusLock::init();
#endif

    mainLogger.info("Attractap starting...");
    application.setup();
#ifdef ATTRACTAP_UI_SELFTEST
    UiSelftest::start(api);
#endif

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
