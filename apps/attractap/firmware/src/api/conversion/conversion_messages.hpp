#pragma once

#include <ArduinoJson.h>

#include <cstdint>
#include <string>
#include <vector>

#include "staging_format.hpp"

// The `conversion.*` CONTROL messages of the "Secure this reader" conversion (ATT-1208) and the chunk request on the
// application channel. Pure: parsing, the burn-command decision and the JSON the reader sends, so the host tests pin
// the exact field names the server parses (apps/api/src/attractap/security/secure-conversion). No message ever
// carries key material, signatures or NVS contents: digests are public data.
namespace ConversionMessages
{
    constexpr const char *PROFILE_MARKER_PREFIX = "attractap-secure-profile-";

    struct Offer
    {
        uint32_t id = 0;
        std::string variant;
        // The secure app must carry this marker. Only a prefix is compiled into the plain app: the full marker in a
        // plain image would make it look like a secure one to secure_packaging.py and the server.
        std::string profileMarker;
        uint32_t secureVersionFloor = 0;
        Staging::Digest digest0{};
        Staging::Digest digest1{};
        uint32_t appSize = 0;
        Staging::Digest appSha256{};
        uint32_t bootloaderSize = 0;
        Staging::Digest bootloaderSha256{};
    };
    // False for anything malformed or out of range (signed sizes are 4 KiB multiples, the bootloader fits 0x8000).
    bool parseOffer(JsonVariantConst message, Offer &out);

    struct BurnCommand
    {
        uint32_t id = 0;
        std::string mac; // lowercase aa:bb:cc:dd:ee:ff
        Staging::Digest digest0{};
        Staging::Digest digest1{};
    };
    bool parseBurn(JsonVariantConst message, BurnCommand &out);

    // `conversion.preflight`, `conversion.write-bootloader`, `conversion.cancel`: the id, 0 when missing.
    uint32_t commandId(JsonVariantConst message);

    // What KEY0 / KEY1 hold right now.
    struct KeySlot
    {
        bool unused = true;           // no purpose, no value, not write-protected
        bool digestPurpose = false;   // purpose SECURE_BOOT_DIGEST0 for KEY0, ..._DIGEST1 for KEY1
        Staging::Digest value{};      // readable digest value (only meaningful with digestPurpose)
    };

    struct BurnContext
    {
        bool stopBeforeBurn = false;
        std::string ownMac;
        // The verify step passed for this conversion, against these digests (staging header).
        bool verified = false;
        uint32_t stagedId = 0;
        Staging::Digest stagedDigest0{};
        Staging::Digest stagedDigest1{};
        KeySlot key0;
        KeySlot key1;
    };

    enum class BurnDecision
    {
        Burn,          // both slots unused: burn KEY0 and KEY1
        AlreadyBurned, // both slots already hold exactly these digests: report, burn nothing
        RefuseStopBeforeBurn,
        RefuseNotVerified,
        RefuseMac,
        RefuseDigests,
        RefuseKeyBlocks,
    };
    // Stop-before-burn wins over everything; then the command must name this conversion, this reader and the very
    // digests the staged images were verified against, and the key slots must be free (or already hold them).
    BurnDecision decideBurn(const BurnCommand &command, const BurnContext &context);
    // `reason` of `conversion.burn-refused`; nullptr for Burn / AlreadyBurned.
    const char *refusalReason(BurnDecision decision);

    struct PreflightFacts
    {
        std::string chip;
        uint32_t chipRevision = 0;
        uint32_t flashSize = 0;
        std::string mac;
        std::string partitionTableSha256;
        struct Key
        {
            std::string purpose;
            bool used = false;
            bool readProtected = false;
            bool writeProtected = false;
        } keys[6];
        bool secureBootEn = false;
        uint32_t cryptCnt = 0;
        bool disDownloadManualEncrypt = false;
        bool jtagPadDisabled = false;
        bool jtagUsbDisabled = false;
        uint32_t heapFree = 0;
        uint32_t heapLargest = 0;
        std::string variant;
        std::string version;
        std::string profile;
    };

    // Stages of `conversion.status` (one per session, before `efuse.report`).
    constexpr const char *STAGE_NONE = "none";
    constexpr const char *STAGE_TRANSFERRING = "transferring";
    constexpr const char *STAGE_VERIFIED = "verified";
    constexpr const char *STAGE_BURNED = "burned";
    constexpr const char *STAGE_BOOTLOADER_WRITTEN = "bootloader-written";
    constexpr const char *STAGE_MIGRATED = "migrated";
    constexpr const char *STAGE_MIGRATION_FAILED = "migration-failed";

    struct Status
    {
        uint32_t id = 0; // 0: no conversion known (sent as null)
        const char *stage = STAGE_NONE;
        bool hasProgress = false;
        uint32_t bytes = 0;
        uint32_t total = 0;
        bool hasRdDis = false;
        bool rdDisLocked = false;
    };

    std::string status(const Status &status);
    std::string preflightReport(uint32_t id, const PreflightFacts &facts);
    std::string verified(uint32_t id, const std::vector<const char *> &problems);
    std::string burned(uint32_t id, const std::string &mac, const std::string &digest0, const std::string &digest1,
                       const char *key0Purpose, const char *key1Purpose);
    std::string burnRefused(uint32_t id, const char *reason);
    std::string bootloaderWritten(uint32_t id, bool ok, const std::string &sha256);

    // Item names of the chunk request.
    constexpr const char *ITEM_APP = "app";
    constexpr const char *ITEM_BOOTLOADER = "bootloader";
    // The FIRMWARE_REQUEST_CHUNK event (application channel) for a conversion item.
    std::string chunkRequest(uint32_t id, const char *item, uint32_t offset, uint32_t length);
}
