#include <Arduino.h>
#include "esp_err.h"
#include "api/api.hpp"
#include "nfc/nfc.hpp"
#ifdef DISPLAY_OLED
#include "display/oled/oled.hpp"
#endif
#ifdef HAS_I2C_KEYPAD
#include "keypad/keypad.hpp"
#endif
#ifdef PIN_NEOPIXEL_LED
#include "leds/neopixel/neopixel.hpp"
#endif
#include "settings/settings.hpp"
#include "cli/CLIService.hpp"
#include "serial-setup/serial-setup.hpp"
#include "firmwareUpdate/firmwareUpdate.hpp"
#include "websocket/websocket.hpp"
#include "network/network.hpp"
#ifdef DISPLAY_TOUCHSCREEN_LVGL
#include "display/touchscreen/touchscreen.hpp"
#endif
#include "logger/logger.hpp"

#include <Wire.h>

Logger mainLogger("Main");

#ifdef PIN_NEOPIXEL_LED
Neopixel leds;
#endif
#ifdef DISPLAY_OLED
OLED oled;
#endif
#ifdef DISPLAY_TOUCHSCREEN_LVGL
Touchscreen touchscreen;
#endif
#ifdef HAS_I2C_KEYPAD
Keypad keypad;
#endif
API api;
NFC nfc;
CLIService cliService;
FirmwareUpdate firmwareUpdate;
Websocket websocket;

void setup()
{
    Serial.begin(115200);
    delay(2000);

    mainLogger.info("Attractap starting...");

    Settings::setup();

    // Initialize I2C for NFC
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_FREQ);
#ifdef DISPLAY_TOUCHSCREEN_LVGL
    touchscreen.setup();
    delay(100);
#endif

    Network::setup();
    websocket.setup();

#ifdef DISPLAY_OLED
    oled.setup();
#endif
#ifdef DISPLAY_TOUCHSCREEN_LVGL

#endif
#ifdef PIN_NEOPIXEL_LED
    leds.setup();
#endif

#ifdef HAS_I2C_KEYPAD
    keypad.setup();
#endif

    nfc.setup();
    api.setup();
    cliService.setup();
    firmwareUpdate.setup();

    SerialSetup::setup(&cliService, &api, &websocket);
}

void loop()
{
    static uint32_t lastDebug = 0;
    if (millis() - lastDebug > 5000)
    {
        mainLogger.debug(("loop running at " + String(millis()) + " ms").c_str());
        lastDebug = millis();
    }

    delay(100); // Reduced delay for more responsive callback processing
}