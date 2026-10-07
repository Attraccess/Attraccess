#include "api.hpp"
#include <cstring>

#include "platform.hpp"

void API::sendHeartbeat()
{
    // send every 5 seconds
    if (this->firmware.inProgress())
    {
        // Suppress heartbeats during OTA to avoid websocket contention
        return;
    }
    if (this->heartbeat_sent_at != 0 && millis() - this->heartbeat_sent_at < (1000 * 5))
    {
        return;
    }

    JsonDocument event;
    event["event"] = "HEARTBEAT";

    char json[JSON_OUTBUF_SMALL];
    size_t n = serializeJson(event, json, sizeof(json));
    if (n == 0)
    {
        this->logger.error("Failed to serialize heartbeat");
        return;
    }
    this->logger.info("Sending reader heartbeat");
    this->transport.sendHeartbeat(json, n);

    this->heartbeat_sent_at = millis();
}
