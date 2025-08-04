#pragma once

#include <Client.h>
#include <PicoWebsocket.h>
#include "persistence.hpp"
#include <ArduinoJson.h>
#include "display.hpp"
#include "keypad.hpp"

#define API_WS_PATH "/api/attractap/websocket"

class API
{
public:
    API(Client &client, Display *display, Keypad *keypad) : websocket(client, API_WS_PATH), client(client), display(display), keypad(keypad) {}
    ~API() {}

    void setup();

    void sendNFCTapped(char *uid, uint8_t uidLength);

    // Check if the API is connected to the server
    bool isConnected();

    // Check if API is properly configured
    bool isConfigured();

    void setOnEnableNfcCardChecking(void (*callback)());
    void setOnDisableNfcCardChecking(void (*callback)());
    void setOnNfcChangeKey(bool (*callback)(uint8_t keyNumber, uint8_t *authKey, uint8_t *oldKey, uint8_t *newKey));
    void setOnNfcAuthenticate(bool (*callback)(uint8_t keyNumber, uint8_t *authenticationKey));

    void enableLoop();
    void disableLoop();
    bool isLoopEnabled();

private:
    TaskHandle_t task_handle;
    static void task_function(void *pvParameters);

    void loop();
    bool loop_is_enabled = false;

    // callback to call when card checking shall be enabled
    void (*onEnableNfcCardChecking)();
    // callback to call when card checking shall be disabled
    void (*onDisableNfcCardChecking)();
    // callback to call when nfc key is changed
    bool (*onNfcChangeKey)(uint8_t keyNumber, uint8_t *authKey, uint8_t *oldKey, uint8_t *newKey);
    // callback to call when nfc is authenticated
    bool (*onNfcAuthenticate)(uint8_t keyNumber, uint8_t *authenticationKey);

    PicoWebsocket::Client websocket;
    Client &client;
    Display *display;
    Keypad *keypad;

    void processData();
    bool checkTCPConnection();

    bool is_connected = false;
    bool is_authenticated = false;
    bool is_connecting = false;

    unsigned long last_connection_attempt = 0;
    unsigned long connection_retry_interval = 5000; // 5 seconds between connection attempts
    unsigned long registration_sent_at = 0;
    unsigned long authentication_sent_at = 0;
    unsigned long heartbeat_sent_at = 0;

    void sendRegistrationRequest();
    void sendAuthenticationRequest();

    bool isRegistered();
    bool isAuthenticated();

    void sendAck(const char *type);
    void sendMessage(bool is_response, const char *type);
    void sendMessage(bool is_response, const char *type, JsonObject payload);
    void sendHeartbeat();

    void onRegistrationData(JsonObject data);
    void onDisplayText(JsonObject data);
    void onUnauthorized(JsonObject data);
    void onEnableCardChecking(JsonObject data);
    void onDisableCardChecking(JsonObject data);
    void onChangeKey(JsonObject data);
    void onAuthenticate(JsonObject data);
    void onReauthenticate(JsonObject data);
    void onShowText(JsonObject data);
    void onFirmwareInfo(JsonObject data);
    void onFirmwareUpdateRequired(JsonObject data);
    void onFirmwareStreamChunk(JsonObject data);

    void hexStringToBytes(const String &hexString, uint8_t *byteArray, size_t byteArrayLength);
};