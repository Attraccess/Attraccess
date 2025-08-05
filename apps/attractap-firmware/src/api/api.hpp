#pragma once

#include <ArduinoJson.h>
#include "../settings/settings.hpp"

class API
{
public:
    void setup();

    void onNFCTapped(char *uid, uint8_t uidLength);

    void setOnEnableNfcCardChecking(void (*callback)());
    void setOnDisableNfcCardChecking(void (*callback)());
    void setOnNfcChangeKey(bool (*callback)(uint8_t keyNumber, uint8_t *authKey, uint8_t *oldKey, uint8_t *newKey));
    void setOnNfcAuthenticate(bool (*callback)(uint8_t keyNumber, uint8_t *authenticationKey));

    void setSendMessageHandler(void (*callback)(String message));
    void processMessage(String message);

    void setOnApiConnectionStatusChanged(void (*callback)(bool isAuthenticated));
    void setDisplayNfcTapEnabledHandler(void (*callback)(bool enabled, String text));
    void setShowTextHandler(void (*callback)(String lineOne, String lineTwo));
    void setDeviceNameChangedHandler(void (*callback)(String deviceName));
    void setDisplaySuccessHandler(void (*callback)(String message));
    void setDisplayErrorHandler(void (*callback)(String message));
    void setDisplaySelectItemHandler(void (*callback)(String type, JsonArray options, String value));
    void setDisplayConfirmActionHandler(void (*callback)(String title, String message));

    void setOnFirmwareUpdateRequiredHandler(void (*callback)());
    void setOnFirmwareStreamChunkHandler(void (*callback)(JsonObject data));

    void setLoopIsEnabled(bool enabled);

    void onKeyPressed(char key);
    bool isRegistered();
    bool isAuthenticated();

private:
    static void task_function(void *pvParameters);
    void loop();

    unsigned long heartbeat_sent_at = 0;
    bool loop_is_enabled = false;

    String select_item_current_value = "";
    bool is_in_select_item_mode = false;
    String select_item_type = "";
    JsonArray select_item_options = JsonArray();

    void (*enableNfcCardCheckingHandler)();
    void (*disableNfcCardCheckingHandler)();
    bool (*nfcAuthenticateHandler)(uint8_t keyNumber, uint8_t *authenticationKey);
    bool (*nfcChangeKeyHandler)(uint8_t keyNumber, uint8_t *authKey, uint8_t *oldKey, uint8_t *newKey);
    void (*sendMessageHandler)(String message);
    void (*apiConnectionStatusChangedHandler)(bool isAuthenticated);
    void (*displayNfcTapEnabledHandler)(bool enabled, String text);
    void (*showTextHandler)(String lineOne, String lineTwo);
    void (*deviceNameChangedHandler)(String deviceName);
    void (*displaySuccessHandler)(String message);
    void (*displayErrorHandler)(String message);
    void (*displaySelectItemHandler)(String type, JsonArray options, String value);
    void (*firmwareUpdateRequiredHandler)();
    void (*firmwareStreamChunkHandler)(JsonObject data);
    void (*confirmActionHandler)(String title, String message);

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
    void onRequestAuthentication(JsonObject data);
    void onReaderAuthenticated(JsonObject data);
    void onNfcAuthenticate(JsonObject data);
    void onShowText(JsonObject data);
    void onFirmwareInfo(JsonObject data);
    void onFirmwareUpdateRequired(JsonObject data);
    void onFirmwareStreamChunk(JsonObject data);
    void onConfirmAction(JsonObject data);

    void hexStringToBytes(const String &hexString, uint8_t *byteArray, size_t byteArrayLength);
};