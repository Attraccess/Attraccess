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
    void processInputEvents();

    Logger logger;

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
    void onUnauthorized(JsonObject data);
    void onRequestAuthentication(JsonObject data);
    void onReaderAuthenticated(JsonObject data);
    void onFirmwareInfo(JsonObject data);

    void onKeyPadConfirmPressed(String value);
    void onKeyPadCancelPressed();
    void onNfcCardDetected(String cardUid);
    void onNfcCardChangeKeySuccess(String payload);
    void onNfcCardChangeKeyFailed(String payload);
    void onNfcCardAuthenticateSuccess(String payload);
    void onNfcCardAuthenticateFailed(String payload);
};