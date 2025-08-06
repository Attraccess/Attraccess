#include <Arduino.h>
#include "esp_err.h"
#include "api/api.hpp"
#include "nfc/nfc.hpp"
#ifdef DISPLAY_OLED
#include "display/oled/display.hpp"
#endif
#ifdef HAS_I2C_KEYPAD
#include "keypad/keypad.hpp"
#endif
#include "leds/leds.hpp"
#include "settings/settings.hpp"
#include "cli/CLIService.hpp"
#include "serial-setup/serial-setup.hpp"
#include "firmwareUpdate/firmwareUpdate.hpp"
#include "websocket/websocket.hpp"
#include "network/network.hpp"

// #include <SPI.h>
#include <Wire.h>

Leds leds;
#ifdef DISPLAY_OLED
Display display(&leds);
#endif
#ifdef HAS_I2C_KEYPAD
Keypad keypad;
#endif
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
#ifdef DISPLAY_OLED
    display.set_api_connected(apiIsAuthenticated && websocketIsConnected);
#endif
}

static void onApiConnectionStatusChanged(bool isAuthenticated)
{
    apiIsAuthenticated = isAuthenticated;
#ifdef DISPLAY_OLED
    display.set_api_connected(apiIsAuthenticated && websocketIsConnected);
#endif
}

static void onNetworkStateChanged(Network::NetworkState state, Network::NetworkType type, const esp_ip4_addr_t &wifi_ip, const esp_ip4_addr_t &ethernet_ip)
{
    display.set_network_connected(state == Network::NETWORK_STATE_CONNECTED);
    websocket.setNetworkIsConnected(state == Network::NETWORK_STATE_CONNECTED);
    display.set_wifi_ip_address(wifi_ip);
    display.set_ethernet_ip_address(ethernet_ip);
}

void setup()
{
    Serial.begin(115200);
    delay(2000);

    Serial.println("Attractap starting...");

    Settings::setup();

    // Initialize SPI for other peripherals if needed
    // SPI.begin(PIN_ETH_SPI_SCK, PIN_ETH_SPI_MISO, PIN_ETH_SPI_MOSI);

    // Initialize I2C for NFC
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_FREQ);

#ifdef DISPLAY_OLED
    display.setup();
#endif
    leds.setup();

#ifdef HAS_I2C_KEYPAD
    keypad.setup();
#endif

    Network::setStateChangedCallback(onNetworkStateChanged);
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
#ifdef DISPLAY_OLED
                                        display.set_nfc_tap_enabled(true, text);
#endif
                                    } });

    api.setShowTextHandler([](String lineOne, String lineTwo)
                           {
#ifdef DISPLAY_OLED
                               display.show_text(lineOne, lineTwo);
#endif
                           });
    // Set up websocket message handlers immediately - don't wait for authentication
    websocket.setMessageHandler([](const String &message)
                                { api.processMessage(message); });

    websocket.setBinaryDataHandler([](const uint8_t *data, size_t length)
                                   { Serial.println("Websocket binary data: " + String(length)); });

    api.setSendMessageHandler([](String message)
                              { websocket.sendMessage(message); });

    api.setDeviceNameChangedHandler([](String deviceName)
                                    {
#ifdef DISPLAY_OLED
                                        display.set_device_name(deviceName);
#endif
                                        api.setDisplaySuccessHandler([](String message)
                                                                     {
#ifdef DISPLAY_OLED
                                                                         display.show_success(message);
#endif
                                                                     });
                                        api.setDisplayErrorHandler([](String message)
                                                                   {
#ifdef DISPLAY_OLED
                                                                       display.show_error(message);
#endif
                                                                   });
                                        api.setDisplaySelectItemHandler([](String type, JsonArray options, String value)
                                                                        {
#ifdef DISPLAY_OLED
                                                                            display.show_select_item(type, options, value);
#endif
                                                                        });
                                        api.setDisplayConfirmActionHandler([](String title, String message)
                                                                           {
#ifdef DISPLAY_OLED
                                                                               display.show_confirm_action(title, message);
#endif
                                                                           });

#ifdef HAS_I2C_KEYPAD
                                        keypad.setOnKeyPressed([](char key)
                                                               { api.onKeyPressed(key); });
#endif
                                    });

    api.setup();
    nfc.setup();
    cliService.setup();
    firmwareUpdate.setup();
    websocket.setup();
    Network::setup();

    SerialSetup::setup(&cliService, &api);
}

void loop()
{
    // TODO: process keypad
}