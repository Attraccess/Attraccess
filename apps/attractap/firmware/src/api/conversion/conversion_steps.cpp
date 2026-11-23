// Conversion steps that change flash or eFuses (ATT-1208): staging the NVS backup, verify (step 3), the digest burn
// (step 4), prepare boot and the bootloader write (steps 5 and 6). Plain app only. See conversion_client.hpp.
#include "conversion_client.hpp"

#if defined(ESP_PLATFORM) && defined(ATTRACTAP_CONVERSION_CLIENT)

#include <cstring>

#include "../../logger/logger.hpp"
#include "../../platform.hpp"
#include "conversion_build.hpp"
#include "conversion_efuse.hpp"
#include "conversion_ui.hpp"
#include "esp_flash.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "nvs_backup.hpp"
#include "psa/crypto.h"
#include "signed_image.hpp"
#include "staging_flash.hpp"

namespace
{
    Logger logger("Conversion");
    constexpr uint32_t BOOTLOADER_FLASH_OFFSET = 0x0;
    constexpr int BOOTLOADER_WRITE_ATTEMPTS = 3;
    // The reader reports the written bootloader, then restarts into it once the report had time to leave.
    constexpr uint32_t REBOOT_AFTER_REPORT_MS = 1500;

    using ConversionClient::state;

    const esp_partition_t *appSlot()
    {
        static const esp_partition_t *cached = nullptr;
        const uint32_t address = state().header.appSlotOffset;
        if (cached && cached->address == address)
        {
            return cached;
        }
        cached = nullptr;
        esp_partition_iterator_t it = esp_partition_find(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_ANY, nullptr);
        for (; it && !cached; it = esp_partition_next(it))
        {
            if (esp_partition_get(it)->address == address)
            {
                cached = esp_partition_get(it);
            }
        }
        esp_partition_iterator_release(it);
        return cached;
    }

    void show(ConversionUi::Phase phase, int percent = 100)
    {
        ConversionClient::showPhase(static_cast<int>(phase), percent);
    }

    // SHA-256 of `length` bytes of the staged NVS backup.
    bool stagedNvsSha(uint32_t length, Staging::Digest &out)
    {
        std::unique_ptr<uint8_t[]> chunk(new (std::nothrow) uint8_t[Staging::CHUNK]);
        psa_hash_operation_t op = PSA_HASH_OPERATION_INIT;
        bool ok = chunk && psa_crypto_init() == PSA_SUCCESS && psa_hash_setup(&op, PSA_ALG_SHA_256) == PSA_SUCCESS;
        for (uint32_t at = 0; ok && at < length; at += Staging::CHUNK)
        {
            const uint32_t n = length - at < Staging::CHUNK ? length - at : Staging::CHUNK;
            ok = StagingFlash::read(Staging::NVS_OFFSET + at, chunk.get(), n) &&
                 psa_hash_update(&op, chunk.get(), n) == PSA_SUCCESS;
        }
        size_t written = 0;
        ok = ok && psa_hash_finish(&op, out.data(), out.size(), &written) == PSA_SUCCESS;
        psa_hash_abort(&op);
        return ok;
    }

    bool sha256(const uint8_t *data, size_t length, Staging::Digest &out)
    {
        size_t written = 0;
        return psa_crypto_init() == PSA_SUCCESS &&
               psa_hash_compute(PSA_ALG_SHA_256, data, length, out.data(), out.size(), &written) == PSA_SUCCESS;
    }

    // The current backup of the migrated namespaces, encoded.
    bool encodedBackup(std::vector<uint8_t> &out)
    {
        std::vector<NvsBackup::Entry> entries;
        return NvsBackupStore::collect(entries) && NvsBackup::encode(entries, out, Staging::NVS_MAX);
    }

    // Writes the encoded backup into the (erased) NVS area and checks it by reading it back.
    bool writeBackup(const std::vector<uint8_t> &encoded, Staging::NvsRecord &record)
    {
        const uint32_t sectors = Staging::chunkCount(static_cast<uint32_t>(encoded.size()));
        Staging::Digest readBack{};
        record.length = static_cast<uint32_t>(encoded.size());
        return StagingFlash::erase(Staging::NVS_OFFSET, sectors * Staging::SECTOR) &&
               StagingFlash::write(Staging::NVS_OFFSET, encoded.data(), encoded.size()) &&
               sha256(encoded.data(), encoded.size(), record.sha256) && stagedNvsSha(record.length, readBack) &&
               readBack == record.sha256;
    }

    // The progress sector is written once per conversion; replacing its NVS record means copy, erase, write back.
    bool replaceNvsRecord(const Staging::NvsRecord &record)
    {
        std::unique_ptr<uint8_t[]> sector(new (std::nothrow) uint8_t[Staging::SECTOR]);
        if (!sector || !StagingFlash::read(Staging::PROGRESS_OFFSET, sector.get(), Staging::SECTOR))
        {
            return false;
        }
        Staging::encodeNvsRecord(record, sector.get() + Staging::NVS_RECORD_OFFSET);
        return StagingFlash::erase(Staging::PROGRESS_OFFSET, Staging::SECTOR) &&
               StagingFlash::write(Staging::PROGRESS_OFFSET, sector.get(), Staging::SECTOR);
    }

    bool stagedNvsIntact()
    {
        Staging::NvsRecord record;
        Staging::Digest digest{};
        return StagingFlash::readNvsRecord(record) && stagedNvsSha(record.length, digest) && digest == record.sha256;
    }

    bool bothBurned(const Staging::Header &header)
    {
        const ConversionMessages::KeySlot key0 = ConversionEfuse::keySlot(0);
        const ConversionMessages::KeySlot key1 = ConversionEfuse::keySlot(1);
        return key0.digestPurpose && key0.value == header.digest0 && key1.digestPurpose && key1.value == header.digest1;
    }

    // Both staged images are signed by the key whose digest is `digest0` and are the images the header names.
    void checkSignatures(const Staging::Header &header, std::vector<const char *> &problems)
    {
        const SignedImage::Result app =
            SignedImage::verify(ConversionClient::readApp, header.appSize, ConversionClient::yieldBriefly);
        if (!app.signatureValid || app.keyDigest != header.digest0)
            problems.push_back("app-signature");
        if (app.imageSha256 != header.appSha256)
            problems.push_back("app-hash");
        const SignedImage::Result bootloader =
            SignedImage::verify(ConversionClient::readBootloader, header.bootloaderSize, ConversionClient::yieldBriefly);
        if (!bootloader.signatureValid || bootloader.keyDigest != header.digest0)
            problems.push_back("bootloader-signature");
        if (bootloader.imageSha256 != header.bootloaderSha256)
            problems.push_back("bootloader-hash");
        if (header.bootloaderSize > Staging::BOOTLOADER_MAX)
            problems.push_back("bootloader-size");
    }

    // Writes the signed bootloader at 0x0 and reads it back; on failure puts the original bootloader back.
    bool writeBootloader(const Staging::Header &header, std::string &shaHex)
    {
        const uint32_t size = header.bootloaderSize;
        std::unique_ptr<uint8_t[]> image(new (std::nothrow) uint8_t[size]);
        std::unique_ptr<uint8_t[]> original(new (std::nothrow) uint8_t[size]);
        std::unique_ptr<uint8_t[]> readBack(new (std::nothrow) uint8_t[size]);
        if (!image || !original || !readBack || !StagingFlash::read(Staging::BOOTLOADER_OFFSET, image.get(), size) ||
            esp_flash_read(nullptr, original.get(), BOOTLOADER_FLASH_OFFSET, size) != ESP_OK)
        {
            return false;
        }
        Staging::Digest digest{};
        for (int attempt = 0; attempt < BOOTLOADER_WRITE_ATTEMPTS; attempt++)
        {
            if (esp_flash_erase_region(nullptr, BOOTLOADER_FLASH_OFFSET, size) == ESP_OK &&
                esp_flash_write(nullptr, image.get(), BOOTLOADER_FLASH_OFFSET, size) == ESP_OK &&
                esp_flash_read(nullptr, readBack.get(), BOOTLOADER_FLASH_OFFSET, size) == ESP_OK &&
                sha256(readBack.get(), size, digest) && digest == header.bootloaderSha256)
            {
                shaHex = Staging::hex(digest.data(), digest.size());
                return true;
            }
        }
        logger.error("Bootloader write did not read back; restoring the original bootloader");
        for (int attempt = 0; attempt < BOOTLOADER_WRITE_ATTEMPTS; attempt++)
        {
            if (esp_flash_erase_region(nullptr, BOOTLOADER_FLASH_OFFSET, size) == ESP_OK &&
                esp_flash_write(nullptr, original.get(), BOOTLOADER_FLASH_OFFSET, size) == ESP_OK &&
                esp_flash_read(nullptr, readBack.get(), BOOTLOADER_FLASH_OFFSET, size) == ESP_OK &&
                memcmp(readBack.get(), original.get(), size) == 0)
            {
                break;
            }
        }
        return false;
    }
}

namespace ConversionClient
{
    bool readApp(uint32_t offset, uint8_t *out, size_t length)
    {
        const esp_partition_t *slot = appSlot();
        return slot && esp_partition_read(slot, offset, out, length) == ESP_OK;
    }

    bool readBootloader(uint32_t offset, uint8_t *out, size_t length)
    {
        return offset + length <= Staging::BOOTLOADER_MAX &&
               StagingFlash::read(Staging::BOOTLOADER_OFFSET + offset, out, length);
    }

    bool stageNvs()
    {
        if (stagedNvsIntact())
        {
            return true;
        }
        Staging::NvsRecord existing;
        std::vector<uint8_t> encoded;
        Staging::NvsRecord record;
        if (!encodedBackup(encoded) || !writeBackup(encoded, record))
        {
            return false;
        }
        // A record that no longer matches its area (a power cut mid-restage) is replaced; a fresh one is just written.
        return StagingFlash::readNvsRecord(existing) ? replaceNvsRecord(record) : StagingFlash::writeNvsRecord(record);
    }

    bool restageNvsIfChanged()
    {
        Staging::NvsRecord record;
        std::vector<uint8_t> encoded;
        Staging::Digest current{};
        if (!encodedBackup(encoded) || !sha256(encoded.data(), encoded.size(), current))
        {
            return false;
        }
        if (StagingFlash::readNvsRecord(record) && record.sha256 == current && stagedNvsIntact())
        {
            return true;
        }
        logger.info("Settings changed since the transfer; staging them again");
        Staging::NvsRecord fresh;
        return writeBackup(encoded, fresh) && replaceNvsRecord(fresh) && stagedNvsIntact();
    }

    void verifyStaged()
    {
        State &s = state();
        const Staging::Header &header = s.header;
        show(ConversionUi::Phase::Verify);
        logger.info("Verifying the staged secure images");
        std::vector<const char *> problems;
        checkSignatures(header, problems);
        if (!s.haveOffer || s.offer.variant != FIRMWARE_VARIANT ||
            !SignedImage::contains(readApp, header.appSize, std::string(FIRMWARE_NAME) + '\0', yieldBriefly))
            problems.push_back("variant");
        if (!s.haveOffer || !SignedImage::contains(readApp, header.appSize, s.offer.profileMarker, yieldBriefly))
            problems.push_back("profile-marker");
        const SignedImage::AppInfo info = SignedImage::appInfo(readApp, header.appSize);
        const uint32_t floor = s.haveOffer && s.offer.secureVersionFloor > 1 ? s.offer.secureVersionFloor : 1;
        if (!info.valid || info.secureVersion < floor)
            problems.push_back("secure-version");
        if (!stagedNvsIntact())
            problems.push_back("staging");
        if (problems.empty() && !StagingFlash::markVerified(header.conversionId))
            problems.push_back("staging");

        sendControl(ConversionMessages::verified(header.conversionId, problems));
        if (!problems.empty())
        {
            logger.errorf("Staged images failed %u check(s)", static_cast<unsigned>(problems.size()));
            finish("verify failed");
            return;
        }
        logger.info("Staged images verified; waiting for the burn command");
    }

    void onBurn(JsonVariantConst message)
    {
        ConversionMessages::BurnCommand command;
        if (!ConversionMessages::parseBurn(message, command))
        {
            logger.error("Ignoring a malformed burn command");
            return;
        }
        Staging::Header header;
        const bool haveHeader = StagingFlash::readHeader(header);
        ConversionMessages::BurnContext context;
        context.stopBeforeBurn = ConversionBuild::stopBeforeBurn();
        context.ownMac = ConversionEfuse::ownMac();
        context.verified = haveHeader && StagingFlash::verifiedFor(command.id);
        context.stagedId = haveHeader ? header.conversionId : 0;
        context.stagedDigest0 = header.digest0;
        context.stagedDigest1 = header.digest1;
        context.key0 = ConversionEfuse::keySlot(0);
        context.key1 = ConversionEfuse::keySlot(1);

        const ConversionMessages::BurnDecision decision = ConversionMessages::decideBurn(command, context);
        if (const char *reason = ConversionMessages::refusalReason(decision))
        {
            logger.errorf("Burn command refused (%s)", reason);
            sendControl(ConversionMessages::burnRefused(command.id, reason));
            finish("burn refused");
            return;
        }
        if (decision == ConversionMessages::BurnDecision::Burn)
        {
            show(ConversionUi::Phase::Burn);
            logger.warn("Burning the Secure Boot digests into KEY0/KEY1");
            if (!ConversionEfuse::burnDigests(command.digest0, command.digest1))
            {
                logger.error("eFuse burn failed");
            }
        }
        // Whatever happened, the report is what the eFuses say now.
        if (!bothBurned(header))
        {
            sendControl(ConversionMessages::burnRefused(command.id, "efuse-error"));
            finish("burn failed");
            return;
        }
        const ConversionMessages::KeySlot key0 = ConversionEfuse::keySlot(0);
        const ConversionMessages::KeySlot key1 = ConversionEfuse::keySlot(1);
        show(ConversionUi::Phase::Burn);
        sendControl(ConversionMessages::burned(command.id, context.ownMac, Staging::hex(key0.value.data(), 32),
                                               Staging::hex(key1.value.data(), 32),
                                               ConversionEfuse::keyPurposeName(0), ConversionEfuse::keyPurposeName(1)));
    }

    void onWriteBootloader(JsonVariantConst message)
    {
        State &s = state();
        const uint32_t id = ConversionMessages::commandId(message);
        Staging::Header header;
        if (!StagingFlash::readHeader(header) || id == 0 || id != header.conversionId || !bothBurned(header))
        {
            logger.error("Write-bootloader refused: no burned, staged conversion with this id");
            sendControl(ConversionMessages::bootloaderWritten(id, false, ""));
            return;
        }
        s.header = header;
        show(ConversionUi::Phase::Verify);
        // Again, against the burned digests: what the bootloader and the ROM will check from now on.
        std::vector<const char *> problems;
        checkSignatures(header, problems);
        const esp_partition_t *slot = appSlot();
        if (!problems.empty() || !slot || !restageNvsIfChanged())
        {
            logger.error("Staged images or settings failed the re-check; not writing the bootloader");
            sendControl(ConversionMessages::bootloaderWritten(id, false, ""));
            finish("re-verify failed");
            return;
        }

        // Brick window 1 starts: from here until the secure app runs, a power cut can leave the reader unbootable.
        show(ConversionUi::Phase::Bootloader);
        logger.warn("Writing the secure bootloader; do not cut the power");
        const esp_partition_t *running = esp_ota_get_running_partition();
        std::string sha;
        if (esp_ota_set_boot_partition(slot) != ESP_OK || !writeBootloader(header, sha))
        {
            // The original bootloader is back and the plain app still boots.
            if (running)
                esp_ota_set_boot_partition(running);
            sendControl(ConversionMessages::bootloaderWritten(id, false, sha));
            ConversionUi::set(ConversionUi::Phase::Burn);
            finish("bootloader write failed");
            return;
        }
        // Prepare boot: the plain app must not stay bootable, and an app without a valid header is skipped by the
        // first-boot flash encryption, which keeps brick window 2 short. Erasing its first sector does both.
        if (running && running != slot && esp_partition_erase_range(running, 0, Staging::SECTOR) != ESP_OK)
        {
            logger.error("Could not erase the old app header; the secure bootloader refuses it anyway (unsigned)");
        }
        sendControl(ConversionMessages::bootloaderWritten(id, true, sha));
        logger.warn("Secure bootloader written; restarting into Secure Boot and flash encryption");
        s.restartAtMs = millis() + REBOOT_AFTER_REPORT_MS;
    }
}

#endif
