// "Secure this reader" (ATT-1208), pure parts of the firmware side: the staging region format, the NVS backup codec,
// the conversion messages (exact field names the server parses) and the burn decision, incl. stop-before-burn.
// Flash, NVS and eFuse access are device-only and covered by the HIL runs; the signature check is in
// signed_image_test.cpp.
#include <ArduinoJson.h>

#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

#include "api/conversion/conversion_messages.hpp"
#include "api/conversion/migration_plan.hpp"
#include "api/conversion/nvs_backup_codec.hpp"
#include "api/conversion/staging_format.hpp"
#include "check.hpp"

int failures = 0;

namespace
{
    const char *D0 = "247299cee1b5d78f6bd72ad92cc4e2b148ec077b68bf8725f71381f4df144ddc";
    const char *D1 = "65c97f279aa20b82d134fd6cc0eeb39d51e42a50d9c3d771f25b42e6487fafd9";
    const char *SHA = "ae150b1aef73cb9b25751e1241497c7a705e223ee86fc51d761ce40829e75406";

    Staging::Digest digest(const char *hex)
    {
        Staging::Digest out{};
        Staging::parseDigest(hex, out);
        return out;
    }

    Staging::Header sampleHeader()
    {
        Staging::Header h;
        h.conversionId = 42;
        h.digest0 = digest(D0);
        h.digest1 = digest(D1);
        h.appSize = 0x1a3000;
        h.appSha256 = digest(SHA);
        h.bootloaderSize = 0x7000;
        h.bootloaderSha256 = digest(D1);
        h.appSlotOffset = 0x650000;
        return h;
    }

    void stagingLayout()
    {
        CHECK(Staging::FLASH_OFFSET == 0xFA0000, "the staging region starts at 0xFA0000");
        CHECK(Staging::FLASH_OFFSET + Staging::REGION_SIZE == 0xFE0000, "it ends where coredump starts");
        CHECK(Staging::NVS_OFFSET == 0xA000 && Staging::NVS_MAX == 0x36000, "NVS backup area");
        CHECK(Staging::BOOTLOADER_OFFSET + Staging::BOOTLOADER_MAX == Staging::NVS_OFFSET, "no overlap");
        CHECK(Staging::NVS_RECORD_OFFSET + Staging::NVS_RECORD_BYTES <= Staging::VERIFIED_RECORD_OFFSET &&
                  Staging::VERIFIED_RECORD_OFFSET + Staging::VERIFIED_RECORD_BYTES <= Staging::SECTOR,
              "progress sector records fit");
        CHECK(Staging::chunkCount(Staging::APP_SLOT_MAX) <= Staging::APP_BITMAP_BYTES * 8, "bitmap covers an app slot");
        CHECK(Staging::chunkCount(Staging::BOOTLOADER_MAX) <= Staging::BOOTLOADER_BITMAP_BYTES * 8, "and a bootloader");
    }

    // A wipe cut short at any sector (power, flash error) leaves either a valid header (still pending: NVS stays
    // protected and the wipe is finished later) or nothing at all; never the NVS backup without its header.
    void wipeOrder()
    {
        std::vector<uint8_t> written(Staging::REGION_SIZE, 0x5a);
        Staging::encodeHeader(sampleHeader(), written.data());
        std::vector<uint32_t> sectors;
        uint32_t covered = 0;
        for (const Staging::EraseRange &range : Staging::WIPE_ORDER)
        {
            CHECK(range.offset % Staging::SECTOR == 0 && range.length % Staging::SECTOR == 0, "sector aligned");
            covered += range.length;
            for (uint32_t at = range.offset; at < range.offset + range.length; at += Staging::SECTOR)
                sectors.push_back(at);
        }
        CHECK(covered == Staging::REGION_SIZE, "a wipe covers the whole region once");
        CHECK(!sectors.empty() && sectors.back() == Staging::HEADER_OFFSET, "the header sector is erased last");
        for (size_t cut = 0; cut <= sectors.size(); cut++)
        {
            std::vector<uint8_t> flash = written;
            for (size_t i = 0; i < cut; i++)
                std::fill(flash.begin() + sectors[i], flash.begin() + sectors[i] + Staging::SECTOR, 0xff);
            Staging::Header header;
            const bool pending = Staging::decodeHeader(flash.data(), Staging::HEADER_BYTES, header);
            const bool empty = std::all_of(flash.begin(), flash.end(), [](uint8_t b) { return b == 0xff; });
            CHECK(pending != empty, "a wipe cut after " << cut << " sector(s) leaves a header or an empty region");
        }
    }

    // Step 8 on the secure app's start-up, and every power cut of it: once the staged backup may be half erased (the
    // MIGRATING marker is committed before the wipe starts), the next boot never restores from it again.
    void migrationPlan()
    {
        using MigrationPlan::Start;
        using MigrationPlan::alreadyMigrated;
        using MigrationPlan::start;
        CHECK(start(false, true, true, false) == Start::Normal, "plain builds never migrate");
        CHECK(start(true, false, true, true) == Start::Normal, "no staged conversion: the usual NVS init");
        CHECK(start(true, true, false, false) == Start::NotSecured &&
                  start(true, true, false, true) == Start::NotSecured,
              "no Secure Boot or flash encryption: NVS and staging untouched");
        CHECK(start(true, true, true, false) == Start::Migrate, "staged and secured: migrate");
        CHECK(start(true, true, true, true) == Start::FinishWipe, "migrated before a restart: only finish the wipe");

        CHECK(!alreadyMigrated(false, 42, MigrationPlan::MIGRATING, 42), "no marker (first boot)");
        CHECK(alreadyMigrated(true, 42, MigrationPlan::MIGRATING, 42), "MIGRATING: entries are in, the wipe was cut");
        CHECK(alreadyMigrated(true, 42, MigrationPlan::MIGRATED, 42), "MIGRATED with a header left (wipe failed)");
        CHECK(!alreadyMigrated(true, 42, MigrationPlan::FAILED, 42), "FAILED: restore again from the intact backup");
        CHECK(!alreadyMigrated(true, 41, MigrationPlan::MIGRATED, 42), "a marker of an earlier conversion");

        // Cut points of migrate(): {marker present, staged backup intact}. Restoring needs an intact backup.
        struct Cut
        {
            const char *point;
            bool marker;
            bool backupIntact;
        };
        const Cut cuts[] = {{"before the NVS erase", false, true},
                            {"after the encrypted NVS init", false, true},
                            {"during the restore", false, true},
                            {"after the MIGRATING marker", true, true},
                            {"during the staging wipe", true, false}};
        for (const Cut &cut : cuts)
        {
            const Start next = start(true, true, true, alreadyMigrated(cut.marker, 42, MigrationPlan::MIGRATING, 42));
            CHECK(next != Start::Migrate || cut.backupIntact, "cut " << cut.point << ": never restore a wiped backup");
            CHECK(next == Start::Migrate || next == Start::FinishWipe,
                  "cut " << cut.point << ": the migration goes on");
        }
    }

    void headerCodec()
    {
        uint8_t bytes[Staging::HEADER_BYTES];
        Staging::encodeHeader(sampleHeader(), bytes);
        Staging::Header decoded;
        CHECK(Staging::decodeHeader(bytes, sizeof(bytes), decoded), "a header decodes");
        CHECK(Staging::sameTransfer(decoded, sampleHeader()), "and round-trips");

        uint8_t erased[Staging::HEADER_BYTES];
        memset(erased, 0xff, sizeof(erased));
        CHECK(!Staging::decodeHeader(erased, sizeof(erased), decoded), "erased flash is no header");
        for (size_t i : {0u, 10u, 50u, 151u, 157u})
        {
            uint8_t broken[Staging::HEADER_BYTES];
            memcpy(broken, bytes, sizeof(broken));
            broken[i] ^= 0x01;
            CHECK(!Staging::decodeHeader(broken, sizeof(broken), decoded), "a flipped bit breaks the header " << i);
        }
        Staging::Header tooBig = sampleHeader();
        tooBig.bootloaderSize = 0x9000;
        Staging::encodeHeader(tooBig, bytes);
        CHECK(!Staging::decodeHeader(bytes, sizeof(bytes), decoded), "a bootloader above 0x8000 is refused");

        Staging::Header other = sampleHeader();
        other.conversionId = 43;
        CHECK(!Staging::sameTransfer(other, sampleHeader()), "another conversion does not resume");
        other = sampleHeader();
        other.appSha256[0] ^= 1;
        CHECK(!Staging::sameTransfer(other, sampleHeader()), "another image does not resume");
    }

    void progressBitmap()
    {
        std::vector<uint8_t> bitmap(4, 0xff);
        CHECK(Staging::chunksDone(bitmap.data(), bitmap.size(), 20) == 0, "fresh: nothing done");
        for (uint32_t i = 0; i < 11; i++)
        {
            bitmap[i / 8] = Staging::markDone(bitmap[i / 8], i);
        }
        CHECK(Staging::chunksDone(bitmap.data(), bitmap.size(), 20) == 11, "eleven chunks done");
        CHECK(Staging::chunksDone(bitmap.data(), bitmap.size(), 5) == 5, "capped at the chunk count");
        bitmap[3] = Staging::markDone(bitmap[3], 30);
        CHECK(Staging::chunksDone(bitmap.data(), bitmap.size(), 32) == 11, "only a run from the start counts");
        CHECK(Staging::markDone(0x00, 3) == 0x00, "marking only ever clears bits");
        CHECK(Staging::chunkCount(1) == 1 && Staging::chunkCount(4096) == 1 && Staging::chunkCount(4097) == 2,
              "chunk count rounds up");
    }

    void records()
    {
        uint8_t nvs[Staging::NVS_RECORD_BYTES];
        Staging::NvsRecord record{1234, digest(SHA)};
        Staging::encodeNvsRecord(record, nvs);
        Staging::NvsRecord decoded;
        CHECK(Staging::decodeNvsRecord(nvs, sizeof(nvs), decoded) && decoded.length == 1234 &&
                  decoded.sha256 == record.sha256,
              "NVS record round-trips");
        memset(nvs, 0xff, sizeof(nvs));
        CHECK(!Staging::decodeNvsRecord(nvs, sizeof(nvs), decoded), "erased: no NVS record");

        uint8_t verified[Staging::VERIFIED_RECORD_BYTES];
        Staging::encodeVerified(42, verified);
        CHECK(Staging::decodeVerified(verified, sizeof(verified), 42), "verified for 42");
        CHECK(!Staging::decodeVerified(verified, sizeof(verified), 41), "not for another conversion");
        memset(verified, 0xff, sizeof(verified));
        CHECK(!Staging::decodeVerified(verified, sizeof(verified), 0xffffffff), "erased is never verified");

        Staging::Digest d{};
        CHECK(!Staging::parseDigest("abc", d) && !Staging::parseDigest(nullptr, d), "short or missing digest");
        CHECK(Staging::hex(digest(D0).data(), 32) == D0, "hex round-trips");
        CHECK(Staging::crc32(reinterpret_cast<const uint8_t *>("123456789"), 9) == 0xCBF43926, "zlib CRC-32");
    }

    void nvsBackup()
    {
        std::vector<NvsBackup::Entry> entries = {
            {"readerpair", "key", NvsBackup::TYPE_BLOB, std::vector<uint8_t>(32, 0xa5)},
            {"readerpair", "rid", NvsBackup::TYPE_U32, {7, 0, 0, 0}},
            {"settings", "lang", NvsBackup::TYPE_STR, {'d', 'e'}},
            {"settings", "empty", NvsBackup::TYPE_STR, {}},
            {"cert_mgr", "idx", NvsBackup::TYPE_I8, {0xff}},
            {"cert_mgr", "big", NvsBackup::TYPE_I64, {1, 2, 3, 4, 5, 6, 7, 8}},
        };
        std::vector<uint8_t> encoded;
        CHECK(NvsBackup::encode(entries, encoded, Staging::NVS_MAX), "backup encodes");
        std::vector<NvsBackup::Entry> decoded;
        CHECK(NvsBackup::decode(encoded.data(), encoded.size(), decoded) && NvsBackup::same(entries, decoded),
              "and round-trips");
        CHECK(!NvsBackup::decode(encoded.data(), encoded.size() - 1, decoded), "truncated: refused");
        std::vector<uint8_t> trailing = encoded;
        trailing.push_back(0);
        CHECK(!NvsBackup::decode(trailing.data(), trailing.size(), decoded), "trailing bytes: refused");
        CHECK(!NvsBackup::encode(entries, encoded, 20), "too large for the area: refused");

        std::vector<NvsBackup::Entry> wrongSize = {{"settings", "x", NvsBackup::TYPE_U16, {1}}};
        CHECK(!NvsBackup::encode(wrongSize, encoded, Staging::NVS_MAX), "integer of the wrong size");
        std::vector<NvsBackup::Entry> longKey = {{"settings", "a_key_far_too_long", NvsBackup::TYPE_U8, {1}}};
        CHECK(!NvsBackup::encode(longKey, encoded, Staging::NVS_MAX), "key longer than NVS allows");

        CHECK(NvsBackup::isMigrated("readerpair") && NvsBackup::isMigrated("settings") &&
                  NvsBackup::isMigrated("cert_mgr"),
              "pairing, settings and certificate choice are migrated");
        CHECK(!NvsBackup::isMigrated("demo_store") && !NvsBackup::isMigrated("conversion") &&
                  !NvsBackup::isMigrated(nullptr),
              "demo_store and the rest are not");
    }

    JsonDocument offerJson()
    {
        JsonDocument doc;
        doc["t"] = "conversion.offer";
        doc["id"] = 42;
        doc["variant"] = "wifi";
        doc["profileMarker"] = "attractap-secure-profile-v1";
        doc["secureVersionFloor"] = 1;
        doc["digest0"] = D0;
        doc["digest1"] = D1;
        doc["app"]["size"] = 0x1a3000;
        doc["app"]["sha256"] = SHA;
        doc["bootloader"]["size"] = 0x7000;
        doc["bootloader"]["sha256"] = SHA;
        return doc;
    }

    void offers()
    {
        ConversionMessages::Offer offer;
        JsonDocument doc = offerJson();
        CHECK(ConversionMessages::parseOffer(doc.as<JsonVariantConst>(), offer), "a valid offer parses");
        CHECK(offer.id == 42 && offer.appSize == 0x1a3000 && offer.bootloaderSize == 0x7000 &&
                  offer.digest0 == digest(D0) && offer.profileMarker == "attractap-secure-profile-v1",
              "with its fields");

        auto refused = [](const char *what, void (*change)(JsonDocument &)) {
            JsonDocument d = offerJson();
            change(d);
            ConversionMessages::Offer o;
            CHECK(!ConversionMessages::parseOffer(d.as<JsonVariantConst>(), o), "offer refused: " << what);
        };
        refused("id 0", [](JsonDocument &d) { d["id"] = 0; });
        refused("bootloader above 0x8000", [](JsonDocument &d) { d["bootloader"]["size"] = 0x9000; });
        refused("unaligned app", [](JsonDocument &d) { d["app"]["size"] = 0x1a3001; });
        refused("app larger than a slot", [](JsonDocument &d) { d["app"]["size"] = 0x641000; });
        refused("short digest", [](JsonDocument &d) { d["digest0"] = "abcd"; });
        refused("same digests", [](JsonDocument &d) { d["digest1"] = D0; });
        refused("foreign marker", [](JsonDocument &d) { d["profileMarker"] = "something-else"; });
        refused("bare marker prefix", [](JsonDocument &d) { d["profileMarker"] = "attractap-secure-profile-"; });
        refused("missing variant", [](JsonDocument &d) { d.remove("variant"); });
        refused("missing app", [](JsonDocument &d) { d.remove("app"); });
    }

    ConversionMessages::BurnContext verifiedContext()
    {
        ConversionMessages::BurnContext context;
        context.ownMac = "dc:b4:d9:21:71:c8";
        context.verified = true;
        context.stagedId = 42;
        context.stagedDigest0 = digest(D0);
        context.stagedDigest1 = digest(D1);
        return context;
    }

    ConversionMessages::BurnCommand burnCommand()
    {
        ConversionMessages::BurnCommand command;
        command.id = 42;
        command.mac = "DC:B4:D9:21:71:C8";
        command.digest0 = digest(D0);
        command.digest1 = digest(D1);
        return command;
    }

    void burnDecision()
    {
        using ConversionMessages::BurnDecision;
        using ConversionMessages::decideBurn;
        CHECK(decideBurn(burnCommand(), verifiedContext()) == BurnDecision::Burn, "verified, own MAC, same digests");

        ConversionMessages::BurnContext lab = verifiedContext();
        lab.stopBeforeBurn = true;
        CHECK(decideBurn(burnCommand(), lab) == BurnDecision::RefuseStopBeforeBurn,
              "stop-before-burn refuses even a perfect command");
        CHECK(strcmp(ConversionMessages::refusalReason(BurnDecision::RefuseStopBeforeBurn), "stop-before-burn") == 0,
              "with reason stop-before-burn");
        lab.key0 = {false, true, digest(D0)};
        lab.key1 = {false, true, digest(D1)};
        CHECK(decideBurn(burnCommand(), lab) == BurnDecision::RefuseStopBeforeBurn, "also when already burned");

        ConversionMessages::BurnContext context = verifiedContext();
        context.verified = false;
        CHECK(decideBurn(burnCommand(), context) == BurnDecision::RefuseNotVerified, "unverified images");
        ConversionMessages::BurnCommand command = burnCommand();
        command.id = 41;
        CHECK(decideBurn(command, verifiedContext()) == BurnDecision::RefuseNotVerified, "another conversion");
        command = burnCommand();
        command.mac = "dc:b4:d9:21:71:c9";
        CHECK(decideBurn(command, verifiedContext()) == BurnDecision::RefuseMac, "another reader's MAC");
        command = burnCommand();
        command.digest1 = digest(SHA);
        CHECK(decideBurn(command, verifiedContext()) == BurnDecision::RefuseDigests, "digests other than verified");

        context = verifiedContext();
        context.key0 = {false, true, digest(D0)};
        context.key1 = {false, true, digest(D1)};
        CHECK(decideBurn(burnCommand(), context) == BurnDecision::AlreadyBurned, "a repeated burn burns nothing");
        context.key1 = {false, false, {}};
        CHECK(decideBurn(burnCommand(), context) == BurnDecision::RefuseKeyBlocks, "a used key block");
        CHECK(ConversionMessages::refusalReason(BurnDecision::Burn) == nullptr, "no reason for a burn");
    }

    void outgoingMessages()
    {
        JsonDocument doc;
        ConversionMessages::Status none;
        deserializeJson(doc, ConversionMessages::status(none));
        CHECK(doc["t"] == "conversion.status" && doc["id"].isNull() && doc["stage"] == "none" &&
                  !doc["bytes"].is<uint32_t>(),
              "status without a conversion");
        ConversionMessages::Status transferring{42, ConversionMessages::STAGE_TRANSFERRING, true, 4096, 8192};
        deserializeJson(doc, ConversionMessages::status(transferring));
        CHECK(doc["id"] == 42 && doc["stage"] == "transferring" && doc["bytes"] == 4096 && doc["total"] == 8192,
              "status with progress");
        ConversionMessages::Status migrated{42, ConversionMessages::STAGE_MIGRATED, false, 0, 0, true, true};
        deserializeJson(doc, ConversionMessages::status(migrated));
        CHECK(doc["stage"] == "migrated" && doc["rdDisLocked"] == true, "migrated with the lock state");

        ConversionMessages::PreflightFacts facts;
        facts.chip = "esp32s3";
        facts.flashSize = 16 * 1024 * 1024;
        facts.mac = "dc:b4:d9:21:71:c8";
        facts.keys[2].writeProtected = true;
        facts.profile = "plain";
        deserializeJson(doc, ConversionMessages::preflightReport(7, facts));
        CHECK(doc["t"] == "conversion.preflight-report" && doc["id"] == 7 && doc["chip"] == "esp32s3" &&
                  doc["flashSize"] == 16777216 && doc["keys"].size() == 6 && doc["keys"][2]["writeProtected"] == true &&
                  doc["jtag"]["padDisabled"] == false && doc["profile"] == "plain" &&
                  doc["partitionTableSha256"].is<const char *>() && doc["heapLargest"].is<uint32_t>(),
              "preflight report fields");

        deserializeJson(doc, ConversionMessages::verified(42, {"app-signature", "variant"}));
        CHECK(doc["t"] == "conversion.verified" && doc["ok"] == false && doc["problems"][1] == "variant",
              "verify failure");
        deserializeJson(doc, ConversionMessages::verified(42, {}));
        CHECK(doc["ok"] == true && doc["problems"].size() == 0, "verify success");
        deserializeJson(doc, ConversionMessages::burned(42, "dc:b4:d9:21:71:c8", D0, D1, "SECURE_BOOT_DIGEST0",
                                                        "SECURE_BOOT_DIGEST1"));
        CHECK(doc["t"] == "conversion.burned" && doc["digest0"] == D0 && doc["key1Purpose"] == "SECURE_BOOT_DIGEST1",
              "burn report");
        deserializeJson(doc, ConversionMessages::burnRefused(42, "stop-before-burn"));
        CHECK(doc["t"] == "conversion.burn-refused" && doc["reason"] == "stop-before-burn", "burn refusal");
        deserializeJson(doc, ConversionMessages::bootloaderWritten(42, true, SHA));
        CHECK(doc["t"] == "conversion.bootloader-written" && doc["ok"] == true && doc["sha256"] == SHA &&
                  !doc["reason"].is<const char *>(),
              "bootloader written");
        deserializeJson(doc, ConversionMessages::bootloaderWritten(42, false, "",
                                                                   ConversionMessages::BOOTLOADER_RESTORE_FAILED));
        CHECK(doc["ok"] == false && doc["sha256"] == "" && doc["reason"] == "restore-failed",
              "a failed restore is reported apart from a failed write");
        deserializeJson(doc, ConversionMessages::chunkRequest(42, ConversionMessages::ITEM_BOOTLOADER, 8192, 4096));
        CHECK(doc["event"] == "EVENT" && doc["data"]["type"] == "FIRMWARE_REQUEST_CHUNK" &&
                  doc["data"]["payload"]["conversion"] == "bootloader" && doc["data"]["payload"]["offset"] == 8192 &&
                  doc["data"]["payload"]["length"] == 4096 && doc["data"]["payload"]["id"] == 42,
              "chunk request");
    }
}

int main()
{
    stagingLayout();
    wipeOrder();
    migrationPlan();
    headerCodec();
    progressBitmap();
    records();
    nvsBackup();
    offers();
    burnDecision();
    outgoingMessages();
    runSignedImageTests();
    if (failures)
    {
        std::cerr << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "secure conversion tests passed\n";
    return 0;
}
