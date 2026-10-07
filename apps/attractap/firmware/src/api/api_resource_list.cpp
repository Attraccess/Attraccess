#include "api.hpp"
#include "resource_introducers.hpp"
#include <functional>
#include <string.h>
#include <string>

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
