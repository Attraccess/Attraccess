#pragma once

#include <ArduinoJson.h>
#include "../settings/settings.hpp"
#include "task_priorities.h"
#include "state/state.hpp"
#include "../logger/logger.hpp"

class API
{
public:
    API() : logger("API"), lastKnownAppStateChangeTime(0) {}

    void setup();

private:
    static void taskFn(void *parameter);
    void loop();
    void processAvailableMessages();

    Logger logger;

    State appState;
    void updateSateInfo();
    uint32_t lastKnownAppStateChangeTime;

    bool loopIsEnabled = false;

    unsigned long heartbeat_sent_at = 0;
    bool isRegistered();

    String select_item_current_value = "";
    bool is_in_select_item_mode = false;
    String select_item_type = "";
    JsonArray select_item_options = JsonArray();

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
    void onDisplaySuccess(JsonObject data);
    void onDisplayError(JsonObject data);
    void onSelectItem(JsonObject data);

    void hexStringToBytes(const String &hexString, uint8_t *byteArray, size_t byteArrayLength);
};