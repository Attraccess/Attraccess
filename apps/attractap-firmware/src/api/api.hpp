#pragma once

#include <ArduinoJson.h>
#include "../settings/settings.hpp"
#include "state/state.hpp"
#include "../logger/logger.hpp"
#include "../websocket/websocket.hpp"

class API
{
public:
    API() : logger("API") {}

    void setup();
    void loop();
    void processIncomingMessages(String message);

private:
    Logger logger;
    Websocket websocket;

    void updateSateInfo();

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
    void onRequestAuthentication();
    void onReaderAuthenticated(JsonObject data);
    void onFirmwareInfo(JsonObject data);
};