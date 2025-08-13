#include <Arduino.h>
#include "esp_err.h"
#include "api/api.hpp"
#include "nfc/nfc.hpp"
#include "settings/settings.hpp"
#include "cli/CLIService.hpp"
#include "serial-setup/serial-setup.hpp"
#include "firmwareUpdate/firmwareUpdate.hpp"
#include "websocket/websocket.hpp"
#include "network/network.hpp"
#include "logger/logger.hpp"
#include <Wire.h>
#include "display/displayManager.hpp"

#ifdef KEYPAD
#include "keypad/keypad.hpp"
#endif

#ifdef PIN_NEOPIXEL_LED
#include "leds/neopixel/neopixel.hpp"
#endif

#ifdef DISPLAY_OLED
#include "display/oled/oled.hpp"
#elif defined(DISPLAY_TOUCHSCREEN_LVGL)
#include "display/touchscreen/touchscreen.hpp"
#endif

Logger mainLogger("Main");
API api;
NFC nfc;
CLIService cliService;
FirmwareUpdate firmwareUpdate;
Websocket websocket;

#ifdef PIN_NEOPIXEL_LED
Neopixel leds;
#endif

#ifdef KEYPAD
Keypad keypad;
#endif

#ifdef DISPLAY_OLED
OLED oled;
DisplayManager displayManager(&oled);
#endif
#ifdef DISPLAY_TOUCHSCREEN_LVGL
Touchscreen touchscreen;
DisplayManager displayManager(&touchscreen);
#endif

void setup()
{
    Serial.begin(115200);
    delay(2000);

    mainLogger.info("Attractap starting...");

    Settings::setup();

    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

    displayManager.setup();
    Network::setup();
    websocket.setup();
    nfc.setup();
    api.setup();
    cliService.setup();
    // firmwareUpdate.setup();
    SerialSetup::setup(&cliService, &api, &websocket);

#ifdef PIN_NEOPIXEL_LED
    leds.setup();
#endif

#ifdef KEYPAD
    keypad.setup();
#endif
}

void loop()
{
    static uint32_t lastDebug = 0;
    if (millis() - lastDebug > 5000)
    {
        mainLogger.debug(("loop running at " + String(millis()) + " ms").c_str());
        lastDebug = millis();
    }
}