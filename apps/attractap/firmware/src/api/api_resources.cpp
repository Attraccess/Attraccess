// Resource list parsing plus usage-session, door, flow-button and billing commands
// FEATURE: api-resources

#include "api.hpp"
#include <functional>
#include <string.h>
#include <string>

void API::onResourceList(JsonObject data)
{
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
        if (desc)
        {
            strlcpy(dst.description, desc, sizeof(dst.description));
        }
        else
        {
            dst.description[0] = '\0';
        }

        dst.isUnderMaintenance = resource["isUnderMaintenance"].is<bool>() ? resource["isUnderMaintenance"].as<bool>() : false;

        // Health state: default to healthy when the field is absent (backwards compatible)
        dst.isHealthy = resource["isHealthy"].is<bool>() ? resource["isHealthy"].as<bool>() : true;
        dst.hasIntroduction = resource["hasIntroduction"].is<bool>() ? resource["hasIntroduction"].as<bool>() : false;
        dst.isIntroducer = resource["isIntroducer"].is<bool>() ? resource["isIntroducer"].as<bool>() : false;
        dst.requiresSupervisor = resource["requiresSupervisor"].is<bool>() ? resource["requiresSupervisor"].as<bool>() : false;
        const char *healthReason = resource["healthReason"].as<const char *>();
        strlcpy(dst.healthReason, healthReason ? healthReason : "", sizeof(dst.healthReason));

        JsonObject aus = resource["activeUsageSession"].as<JsonObject>();
        if (!aus.isNull() && aus["user"]["username"].is<const char *>() && aus["startTime"].is<const char *>())
        {
            dst.hasActiveUsage = true;
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
        JsonArray introducers = resource["introducers"].as<JsonArray>();
        if (!introducers.isNull())
        {
            dst.introducers.reserve(introducers.size());
            for (JsonVariant v : introducers)
            {
                const char *introName = v.is<const char *>() ? v.as<const char *>() : nullptr;
                if (introName && introName[0] != '\0')
                {
                    dst.introducers.emplace_back(introName);
                }
            }
        }

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

void API::triggerFlowButton(uint32_t resourceId, const char *buttonId)
{
    this->logger.info("Triggering flow button");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    payload["buttonId"] = buttonId ? buttonId : "";
    this->sendMessage("TRIGGER_FLOW_BUTTON", payload);
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
    this->sendMessage("START_RESOURCE_USAGE_SESSION", payload);
}

void API::stopResourceUsageSession(uint32_t resourceId)
{
    this->logger.info("Stopping resource usage session");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("STOP_RESOURCE_USAGE_SESSION", payload);
}

void API::lockDoor(uint32_t resourceId)
{
    this->logger.info("Locking door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("LOCK_DOOR", payload);
}

void API::unlockDoor(uint32_t resourceId)
{
    this->logger.info("Unlocking door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("UNLOCK_DOOR", payload);
}

void API::unlatchDoor(uint32_t resourceId)
{
    this->logger.info("Unlatching door");
    JsonDocument doc;
    JsonObject payload = doc.to<JsonObject>();
    payload["resourceId"] = resourceId;
    this->sendMessage("UNLATCH_DOOR", payload);
}

void API::setLedBrightnessChangedCallback(std::function<void(uint8_t)> callback)
{
    this->ledBrightnessChangedCallback = callback;
}
