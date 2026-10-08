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
    for (auto meter : usage["meters"].as<JsonArray>()) {
        const char *name = meter["name"].as<const char *>();
        const char *value = meter["value"].as<const char *>();
        if (name) {
            UsageStats::MeterValue reading{};
            reading.name = name;
            reading.value = value ? value : "";
            if (meter["creditsPerUnit"].is<int64_t>() && meter["creditsPerUnit"].as<int64_t>() >= 0)
                reading.creditsPerUnit = meter["creditsPerUnit"].as<int64_t>();
            reading.formattedRate = meter["formattedRate"] | "";
            stats.meters.push_back(std::move(reading));
        }
    }
    usageStatsCallback(stats);
}

void API::onResourceList(JsonObject data)
{
    const uint32_t revision = data["payload"]["revision"] | 0u;
    if (revision && resourceListRevision && static_cast<int32_t>(revision - resourceListRevision) < 0) {
        // A newer broadcast can overtake an explicit refresh. Acknowledge that
        // refresh with the retained newer snapshot, never its obsolete data.
        const uint32_t requestId = data["payload"]["requestId"] | 0u;
        if (requestId && resourceListUpdateCallback) {
            const auto previousRequestId = resourceListScratch.requestId;
            resourceListScratch.requestId = requestId;
            resourceListUpdateCallback(resourceListScratch);
            resourceListScratch.requestId = previousRequestId;
        }
        return;
    }
    if (revision) resourceListRevision = revision;
    uint32_t messageCounter = data["payload"]["messageId"].is<uint32_t>() ? data["payload"]["messageId"].as<uint32_t>() : 0;
    if (messageCounter <= this->resourceListMessageCounter && this->resourceListMessageCounter != 0)
    {
        this->logger.info("Received resource list with older message ID; ignoring");
        return;
    }
    this->resourceListMessageCounter = messageCounter;

    if (data["payload"]["readerName"].is<const char *>())
    {
        this->logger.info("Received updated reader name");
        std::string readerName = data["payload"]["readerName"].as<std::string>();

        if (this->deviceNameCallback != nullptr)
        {
            this->deviceNameCallback(readerName);
        }
    }

    if (data["payload"]["ledBrightness"].is<int>())
    {
        int rawBrightness = data["payload"]["ledBrightness"].as<int>();
        if (rawBrightness < 0) rawBrightness = 0;
        if (rawBrightness > 255) rawBrightness = 255;
        uint8_t brightness = (uint8_t)rawBrightness;
        if (brightness != Settings::getLedBrightness()) {
            Settings::setLedBrightness(brightness);
            if (this->ledBrightnessChangedCallback != nullptr)
            {
                this->ledBrightnessChangedCallback(brightness);
            }
        }
    }

    this->logger.info("Received resource list");
    if (this->resourceListUpdateCallback == nullptr)
    {
        this->logger.error("Resource list update callback is not set");
        return;
    }

    ResourceList &result = this->resourceListScratch;
    result = ResourceList{};
    result.requestId = data["payload"]["requestId"] | 0u;
    const char *authenticatedUsername = data["payload"]["authenticatedUsername"].as<const char *>();
    strlcpy(result.authenticatedUsername, authenticatedUsername ? authenticatedUsername : "", sizeof(result.authenticatedUsername));

    JsonArray arr = data["payload"]["resources"].as<JsonArray>();
    if (arr.isNull())
    {
        result.count = 0;
        this->resourceListUpdateCallback(result);
        return;
    }

    uint16_t count = 0;
    for (JsonObject resource : arr)
    {
        if (count >= MAX_RESOURCES)
        {
            break;
        }

        ResourceBrief &dst = result.items[count];
        dst.id = resource["id"].is<uint32_t>() ? resource["id"].as<uint32_t>() : 0;
        const char *typeStr = resource["type"].as<const char *>();
        dst.type = (typeStr && strcmp(typeStr, "door") == 0) ? 1 : 0;
        dst.separateUnlockAndUnlatch = resource["separateUnlockAndUnlatch"].is<bool>() ? resource["separateUnlockAndUnlatch"].as<bool>() : false;
        dst.allowTakeOver = resource["allowTakeOver"].is<bool>() ? resource["allowTakeOver"].as<bool>() : false;
        dst.accessKnown = resource["hasIntroduction"].is<bool>();
        dst.canManageMaintenance = resource["canManageMaintenance"] | false;
        dst.hasIntroduction = resource["hasIntroduction"] | false;
        dst.isIntroducer = resource["isIntroducer"] | false;
        dst.canManageResource = resource["canManageResource"] | false;
        dst.requiresSupervisor = resource["requiresSupervisor"] | false;

        const char *name = resource["name"].as<const char *>();
        const char *desc = resource["description"].as<const char *>();
        if (name)
        {
            strlcpy(dst.name, name, sizeof(dst.name));
        }
        else
        {
            dst.name[0] = '\0';
        }
        dst.description = desc ? desc : "";

        dst.isUnderMaintenance = resource["isUnderMaintenance"].is<bool>() ? resource["isUnderMaintenance"].as<bool>() : false;

        // Health state: default to healthy when the field is absent (backwards compatible)
        dst.isHealthy = resource["isHealthy"].is<bool>() ? resource["isHealthy"].as<bool>() : true;
        const char *healthReason = resource["healthReason"].as<const char *>();
        strlcpy(dst.healthReason, healthReason ? healthReason : "", sizeof(dst.healthReason));

        JsonObject aus = resource["activeUsageSession"].as<JsonObject>();
        if (!aus.isNull() && aus["user"]["username"].is<const char *>() && aus["startTime"].is<const char *>())
        {
            dst.hasActiveUsage = true;
            dst.activeUsageId = aus["id"] | 0u;
            const char *username = aus["user"]["username"].as<const char *>();
            strlcpy(dst.activeUser, username ? username : "", sizeof(dst.activeUser));
            const char *startIso = aus["startTime"].as<const char *>();
            dst.activeStartEpoch = parseIso8601ToTimeT(startIso);
            // Offset is optional for backwards compatibility; absent -> 0 (render UTC as before)
            dst.activeStartUtcOffsetMinutes = aus["startTimeUtcOffsetMinutes"].is<int>() ? (int16_t)aus["startTimeUtcOffsetMinutes"].as<int>() : 0;
        }
        else
        {
            dst.hasActiveUsage = false;
            dst.activeUser[0] = '\0';
            dst.activeStartEpoch = 0;
            dst.activeStartUtcOffsetMinutes = 0;
        }

        // Parse introducers: array of strings (usernames)
        dst.introducers = parseResourceIntroducers(resource["introducers"].as<JsonArrayConst>());

        // Parse flowButtons: array of { id, label }
        dst.flowButtonCount = 0;
        JsonArray flowButtons = resource["flowButtons"].as<JsonArray>();
        if (!flowButtons.isNull())
        {
            uint8_t fbIdx = 0;
            for (JsonObject btn : flowButtons)
            {
                if (fbIdx >= MAX_FLOW_BUTTONS)
                {
                    break;
                }
                API::FlowButton &fb = dst.flowButtons[fbIdx];
                const char *idStr = btn["id"].as<const char *>();
                if (!idStr)
                {
                    idStr = "";
                }
                strlcpy(fb.id, idStr, sizeof(fb.id));
                const char *lbl = btn["label"].as<const char *>();
                if (!lbl)
                {
                    lbl = "";
                }
                strlcpy(fb.label, lbl, sizeof(fb.label));
                fbIdx++;
            }
            dst.flowButtonCount = fbIdx;
        }

        count++;
    }

    result.count = count;
    this->resourceListUpdateCallback(result);
}
