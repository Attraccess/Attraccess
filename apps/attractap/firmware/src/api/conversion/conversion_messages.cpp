#include "conversion_messages.hpp"

#include <cstring>

namespace
{
    constexpr size_t MAX_VARIANT = 32;
    constexpr size_t MAX_MARKER = 64;
    constexpr uint32_t MAX_SECURE_VERSION = 0xffff;

    bool positiveId(JsonVariantConst value, uint32_t &out)
    {
        if (!value.is<uint32_t>())
        {
            return false;
        }
        out = value.as<uint32_t>();
        return out != 0;
    }

    bool signedSize(JsonVariantConst value, uint32_t max, uint32_t &out)
    {
        if (!value.is<uint32_t>())
        {
            return false;
        }
        const uint32_t size = value.as<uint32_t>();
        // A signed image is at least one content sector plus the signature sector.
        if (size < 2 * Staging::SECTOR || size > max || size % Staging::SECTOR != 0)
        {
            return false;
        }
        out = size;
        return true;
    }

    bool digestField(JsonVariantConst value, Staging::Digest &out)
    {
        return value.is<const char *>() && Staging::parseDigest(value.as<const char *>(), out);
    }

    bool image(JsonVariantConst value, uint32_t max, uint32_t &size, Staging::Digest &sha)
    {
        return value.is<JsonObjectConst>() && signedSize(value["size"], max, size) && digestField(value["sha256"], sha);
    }

    bool sameMac(const std::string &a, const std::string &b)
    {
        if (a.size() != 17 || b.size() != 17)
        {
            return false;
        }
        for (size_t i = 0; i < a.size(); i++)
        {
            const char x = a[i] >= 'A' && a[i] <= 'F' ? static_cast<char>(a[i] - 'A' + 'a') : a[i];
            const char y = b[i] >= 'A' && b[i] <= 'F' ? static_cast<char>(b[i] - 'A' + 'a') : b[i];
            if (x != y)
            {
                return false;
            }
        }
        return true;
    }

    bool slotHolds(const ConversionMessages::KeySlot &slot, const Staging::Digest &digest)
    {
        return !slot.unused && slot.digestPurpose && slot.value == digest;
    }

    std::string serialize(const JsonDocument &doc)
    {
        std::string out;
        serializeJson(doc, out);
        return out;
    }

    void putId(JsonDocument &doc, uint32_t id)
    {
        if (id == 0)
        {
            doc["id"] = nullptr;
        }
        else
        {
            doc["id"] = id;
        }
    }
}

namespace ConversionMessages
{
    bool parseOffer(JsonVariantConst message, Offer &out)
    {
        Offer offer;
        const char *variant = message["variant"] | "";
        const char *marker = message["profileMarker"] | "";
        JsonVariantConst floor = message["secureVersionFloor"];
        if (!positiveId(message["id"], offer.id) || strlen(variant) == 0 || strlen(variant) > MAX_VARIANT ||
            strlen(marker) > MAX_MARKER || strncmp(marker, PROFILE_MARKER_PREFIX, strlen(PROFILE_MARKER_PREFIX)) != 0 ||
            strlen(marker) == strlen(PROFILE_MARKER_PREFIX) || !floor.is<uint32_t>() ||
            floor.as<uint32_t>() > MAX_SECURE_VERSION || !digestField(message["digest0"], offer.digest0) ||
            !digestField(message["digest1"], offer.digest1) || offer.digest0 == offer.digest1 ||
            !image(message["app"], Staging::APP_SLOT_MAX, offer.appSize, offer.appSha256) ||
            !image(message["bootloader"], Staging::BOOTLOADER_MAX, offer.bootloaderSize, offer.bootloaderSha256))
        {
            return false;
        }
        offer.variant = variant;
        offer.profileMarker = marker;
        offer.secureVersionFloor = floor.as<uint32_t>();
        out = offer;
        return true;
    }

    bool parseBurn(JsonVariantConst message, BurnCommand &out)
    {
        BurnCommand command;
        const char *mac = message["mac"] | "";
        if (!positiveId(message["id"], command.id) || strlen(mac) != 17 ||
            !digestField(message["digest0"], command.digest0) || !digestField(message["digest1"], command.digest1))
        {
            return false;
        }
        command.mac = mac;
        out = command;
        return true;
    }

    uint32_t commandId(JsonVariantConst message)
    {
        uint32_t id = 0;
        return positiveId(message["id"], id) ? id : 0;
    }

    BurnDecision decideBurn(const BurnCommand &command, const BurnContext &context)
    {
        if (context.stopBeforeBurn)
        {
            return BurnDecision::RefuseStopBeforeBurn;
        }
        if (!context.verified || context.stagedId == 0 || command.id != context.stagedId)
        {
            return BurnDecision::RefuseNotVerified;
        }
        if (!sameMac(command.mac, context.ownMac))
        {
            return BurnDecision::RefuseMac;
        }
        if (command.digest0 != context.stagedDigest0 || command.digest1 != context.stagedDigest1)
        {
            return BurnDecision::RefuseDigests;
        }
        if (slotHolds(context.key0, command.digest0) && slotHolds(context.key1, command.digest1))
        {
            return BurnDecision::AlreadyBurned;
        }
        if (!context.key0.unused || !context.key1.unused)
        {
            return BurnDecision::RefuseKeyBlocks;
        }
        return BurnDecision::Burn;
    }

    const char *refusalReason(BurnDecision decision)
    {
        switch (decision)
        {
        case BurnDecision::RefuseStopBeforeBurn:
            return "stop-before-burn";
        case BurnDecision::RefuseNotVerified:
            return "not-verified";
        case BurnDecision::RefuseMac:
            return "mac";
        case BurnDecision::RefuseDigests:
            return "digests";
        case BurnDecision::RefuseKeyBlocks:
            return "key-blocks";
        default:
            return nullptr;
        }
    }

    std::string status(const Status &status)
    {
        JsonDocument doc;
        doc["t"] = "conversion.status";
        putId(doc, status.id);
        doc["stage"] = status.stage;
        if (status.hasProgress)
        {
            doc["bytes"] = status.bytes;
            doc["total"] = status.total;
        }
        if (status.hasRdDis)
        {
            doc["rdDisLocked"] = status.rdDisLocked;
        }
        return serialize(doc);
    }

    std::string preflightReport(uint32_t id, const PreflightFacts &facts)
    {
        JsonDocument doc;
        doc["t"] = "conversion.preflight-report";
        putId(doc, id);
        doc["chip"] = facts.chip;
        doc["chipRevision"] = facts.chipRevision;
        doc["flashSize"] = facts.flashSize;
        doc["mac"] = facts.mac;
        doc["partitionTableSha256"] = facts.partitionTableSha256;
        JsonArray keys = doc["keys"].to<JsonArray>();
        for (const PreflightFacts::Key &key : facts.keys)
        {
            JsonObject entry = keys.add<JsonObject>();
            entry["purpose"] = key.purpose;
            entry["used"] = key.used;
            entry["readProtected"] = key.readProtected;
            entry["writeProtected"] = key.writeProtected;
        }
        doc["secureBootEn"] = facts.secureBootEn;
        doc["cryptCnt"] = facts.cryptCnt;
        doc["disDownloadManualEncrypt"] = facts.disDownloadManualEncrypt;
        doc["jtag"]["padDisabled"] = facts.jtagPadDisabled;
        doc["jtag"]["usbDisabled"] = facts.jtagUsbDisabled;
        doc["heapFree"] = facts.heapFree;
        doc["heapLargest"] = facts.heapLargest;
        doc["variant"] = facts.variant;
        doc["version"] = facts.version;
        doc["profile"] = facts.profile;
        return serialize(doc);
    }

    std::string verified(uint32_t id, const std::vector<const char *> &problems)
    {
        JsonDocument doc;
        doc["t"] = "conversion.verified";
        putId(doc, id);
        doc["ok"] = problems.empty();
        JsonArray list = doc["problems"].to<JsonArray>();
        for (const char *problem : problems)
        {
            list.add(problem);
        }
        return serialize(doc);
    }

    std::string burned(uint32_t id, const std::string &mac, const std::string &digest0, const std::string &digest1,
                       const char *key0Purpose, const char *key1Purpose)
    {
        JsonDocument doc;
        doc["t"] = "conversion.burned";
        putId(doc, id);
        doc["mac"] = mac;
        doc["digest0"] = digest0;
        doc["digest1"] = digest1;
        doc["key0Purpose"] = key0Purpose;
        doc["key1Purpose"] = key1Purpose;
        return serialize(doc);
    }

    std::string burnRefused(uint32_t id, const char *reason)
    {
        JsonDocument doc;
        doc["t"] = "conversion.burn-refused";
        putId(doc, id);
        doc["reason"] = reason;
        return serialize(doc);
    }

    std::string bootloaderWritten(uint32_t id, bool ok, const std::string &sha256, const char *reason)
    {
        JsonDocument doc;
        doc["t"] = "conversion.bootloader-written";
        putId(doc, id);
        doc["ok"] = ok;
        doc["sha256"] = sha256;
        if (!ok && reason)
        {
            doc["reason"] = reason;
        }
        return serialize(doc);
    }

    std::string chunkRequest(uint32_t id, const char *item, uint32_t offset, uint32_t length)
    {
        JsonDocument doc;
        doc["event"] = "EVENT";
        doc["data"]["type"] = "FIRMWARE_REQUEST_CHUNK";
        JsonObject payload = doc["data"]["payload"].to<JsonObject>();
        payload["offset"] = offset;
        payload["length"] = length;
        payload["conversion"] = item;
        payload["id"] = id;
        return serialize(doc);
    }
}
