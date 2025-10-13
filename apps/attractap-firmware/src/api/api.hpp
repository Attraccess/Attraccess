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
    void setResourceListUpdateCallback(std::function<void(JsonArray)> callback);

private:
    Logger logger;
    Websocket websocket;

    void updateSateInfo();

    bool loopIsEnabled = false;

    unsigned long heartbeat_sent_at = 0;
    bool isRegistered();

    std::function<void(JsonArray)> resourceListUpdateCallback;

    void sendAck(const char *type);
    void sendMessage(const char *type);
    void sendMessage(const char *type, JsonObject payload);
    void sendHeartbeat();

    void onRegistrationData(JsonObject data);
    void onUnauthorized(JsonObject data);
    void sendAuthenticationRequest();
    void onReaderAuthenticated(JsonObject data);
    void sendFirmwareInfo();
    void onResourceList(JsonObject data);
};