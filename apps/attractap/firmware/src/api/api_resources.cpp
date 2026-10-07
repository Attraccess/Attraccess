// Resource list parsing plus usage-session, door, flow-button and billing commands
// FEATURE: api-resources

#include "api.hpp"
#include "resource_introducers.hpp"
#include <functional>
#include <string.h>
#include <string>


void API::triggerFlowButton(uint32_t resourceId, const char *buttonId)
{
    this->logger.info("Triggering flow button");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    payload["buttonId"] = buttonId ? buttonId : "";
    this->sendResourceAction("TRIGGER_FLOW_BUTTON", payload);
}

uint32_t API::requestResourceList()
{
    JsonDocument doc;
    auto payload = doc.to<JsonObject>();
    const uint32_t requestId = ++nextRequestId;
    payload["requestId"] = requestId;
    this->sendMessage("REQUEST_RESOURCE_LIST", payload);
    return requestId;
}

void API::sendResourceAction(const char *type, JsonObject payload)
{
    activeActionRequestId = ++nextRequestId;
    payload["requestId"] = activeActionRequestId.load();
    this->sendMessage(type, payload);
}

void API::requestBillingTopup(uint32_t amountCents)
{
    this->logger.info("Requesting billing top-up");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["amountCents"] = amountCents;
    this->sendMessage("BILLING_REQUEST_TOPUP", payload);
}

void API::setResourceListUpdateCallback(std::function<void(const ResourceList &)> callback)
{
    this->resourceListUpdateCallback = callback;
}

void API::startResourceUsageSession(uint32_t resourceId, uint32_t projectId, bool forceTakeOver)
{
    this->logger.info("Starting resource usage session");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    if (projectId != 0)
    {
        payload["projectId"] = projectId;
    }
    if (forceTakeOver)
    {
        payload["forceTakeOver"] = true;
    }
    this->sendResourceAction("START_RESOURCE_USAGE_SESSION", payload);
}

void API::stopResourceUsageSession(uint32_t resourceId)
{
    this->logger.info("Stopping resource usage session");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendResourceAction("STOP_RESOURCE_USAGE_SESSION", payload);
}

void API::lockDoor(uint32_t resourceId)
{
    this->logger.info("Locking door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendResourceAction("LOCK_DOOR", payload);
}

void API::unlockDoor(uint32_t resourceId)
{
    this->logger.info("Unlocking door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendResourceAction("UNLOCK_DOOR", payload);
}

void API::unlatchDoor(uint32_t resourceId)
{
    this->logger.info("Unlatching door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendResourceAction("UNLATCH_DOOR", payload);
}

void API::setLedBrightnessChangedCallback(std::function<void(uint8_t)> callback)
{
    this->ledBrightnessChangedCallback = callback;
}

void API::requestUsageStats(uint32_t resourceId)
{
    JsonDocument doc;
    auto payload = doc.to<JsonObject>();
    usageStatsRequestId = ++nextRequestId;
    payload["requestId"] = usageStatsRequestId.load();
    payload["resourceId"] = resourceId;
    this->sendMessage("RESOURCE_USAGE_STATS", payload);
}

void API::setUsageStatsCallback(std::function<void(const UsageStats &)> callback)
{
    usageStatsCallback = std::move(callback);
}

void API::onUsageStats(JsonObject data)
{
    auto payload = data["payload"].as<JsonObject>();
    if (!usageStatsCallback || (payload["requestId"] | 0u) != usageStatsRequestId.load()) return;
    UsageStats stats;
    stats.resourceId = payload["resourceId"] | 0u;
    auto usage = payload["usage"].as<JsonObject>();
    stats.usageId = usage["id"] | 0u;
    if (usage["operatingDurationMs"].is<int64_t>() && usage["operatingDurationMs"].as<int64_t>() >= 0)
        stats.operatingDurationMs = usage["operatingDurationMs"].as<int64_t>();
    if (usage["isOperating"].is<bool>()) stats.isOperating = usage["isOperating"].as<bool>() ? 1 : 0;
    const char *energy = usage["energyKwh"].as<const char *>();
    if (energy) stats.energyKwh = energy;
    usageStatsCallback(stats);
}
