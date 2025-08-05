#include <Arduino.h>
#include "network/wifi.hpp"
#include "configuration.hpp"
#include "api/api.hpp"
#include "nfc/nfc.hpp"
#include "display/display.hpp"
#include "keypad/keypad.hpp"
#include "leds/leds.hpp"
#include "settings/settings.hpp"
#include "cli/CLIService.hpp"
#include "serial-setup/serial-setup.hpp"
#include "firmwareUpdate/firmwareUpdate.hpp"
#include "websocket/websocket.hpp"

#include <SPI.h>
#include <Wire.h>

Leds leds;
Display display(&leds);
Keypad keypad;
API api;
NFC nfc;
CLIService cliService;
FirmwareUpdate firmwareUpdate;
Websocket websocket;

// Global variables to track connection status
static bool apiIsAuthenticated = false;
static bool websocketIsConnected = false;

// Callback functions that can be used as function pointers
static void onWebsocketStateChanged(Websocket::ConnectionState state)
{
    websocketIsConnected = state == Websocket::CONNECTED;
    api.setLoopIsEnabled(state == Websocket::CONNECTED);
    display.set_api_connected(apiIsAuthenticated && websocketIsConnected);
}

static void onApiConnectionStatusChanged(bool isAuthenticated)
{
    apiIsAuthenticated = isAuthenticated;
    display.set_api_connected(apiIsAuthenticated && websocketIsConnected);
}

void setup()
{
    Serial.begin(115200);
    delay(2000);

    Serial.println("Attractap starting...");

    Settings::setup();

    // Initialize SPI for other peripherals if needed
    SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI);

    // Initialize I2C for NFC
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_FREQ);

    display.setup();
    leds.setup();

    keypad.setup();

    Wifi::setup();

    api.setup();
    nfc.setup();
    cliService.setup();
    firmwareUpdate.setup();
    websocket.setup();

    SerialSetup::setup(&cliService, &api);

    Wifi::setStateChangedCallback([](Wifi::WifiState state, const String &ssid)
                                  { 
                                    display.set_network_connected(state == Wifi::WIFI_STATE_CONNECTED);
                                    display.set_ip_address(Wifi::getIPAddress()); 
                                    websocket.setNetworkIsConnected(state == Wifi::WIFI_STATE_CONNECTED); });

    websocket.setStateChangedHandler(onWebsocketStateChanged);
    api.setOnApiConnectionStatusChanged(onApiConnectionStatusChanged);

    api.setOnDisableNfcCardChecking([]()
                                    { nfc.disableLoopCardDetection(); });
    api.setOnEnableNfcCardChecking([]()
                                   { nfc.enableLoopCardDetection(); });
    api.setOnNfcAuthenticate([](uint8_t keyNumber, uint8_t *authenticationKey)
                             { return nfc.authenticate(keyNumber, authenticationKey); });
    api.setOnNfcChangeKey([](uint8_t keyNumber, uint8_t *authKey, uint8_t *oldKey, uint8_t *newKey)
                          { return nfc.changeKey(keyNumber, authKey, oldKey, newKey); });

    nfc.setOnNfcCardDetected([](char *uuid)
                             { api.onNFCTapped(uuid, strlen(uuid)); });

    api.setOnFirmwareUpdateRequiredHandler([]()
                                           { firmwareUpdate.start(); });

    api.setOnFirmwareStreamChunkHandler([](JsonObject data)
                                        { firmwareUpdate.processChunk(); });

    api.setDisplayNfcTapEnabledHandler([](bool enabled, String text)
                                       {
                                    if (enabled)
                                    {
                                        display.set_nfc_tap_enabled(true, text);
                                    } });

    api.setShowTextHandler([](String lineOne, String lineTwo)
                           { display.show_text(lineOne, lineTwo); });
    api.setDeviceNameChangedHandler([](String deviceName)
                                    { display.set_device_name(deviceName); });
    api.setDisplaySuccessHandler([](String message)
                                 { display.show_success(message); });
    api.setDisplayErrorHandler([](String message)
                               { display.show_error(message); });
    api.setDisplaySelectItemHandler([](String type, JsonArray options, String value)
                                    { display.show_select_item(type, options, value); });
    api.setDisplayConfirmActionHandler([](String title, String message)
                                       { display.show_confirm_action(title, message); });

    websocket.setMessageHandler([](const String &message)
                                { api.processMessage(message); });

    websocket.setBinaryDataHandler([](const uint8_t *data, size_t length)
                                   { Serial.println("Websocket binary data: " + String(length)); });

    api.setSendMessageHandler([](String message)
                              { websocket.sendMessage(message); });

    keypad.setOnKeyPressed([](char key)
                           { api.onKeyPressed(key); });
}

void loop()
{
    // TODO: process keypad
}