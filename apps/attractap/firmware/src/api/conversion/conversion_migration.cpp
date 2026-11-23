#include "conversion_migration.hpp"

#include "conversion_build.hpp"
#include "staging_flash.hpp"

#if defined(ESP_PLATFORM)

#include <memory>
#include <vector>

#include "../../logger/logger.hpp"
#include "conversion_efuse.hpp"
#include "conversion_messages.hpp"
#include "nvs.h"
#include "nvs_backup.hpp"
#include "nvs_flash.h"
#include "psa/crypto.h"

namespace
{
    Logger logger("Migration");

    // The secure app's record of the migration (not migrated itself): which conversion, and how far it got.
    constexpr const char *MARKER_NAMESPACE = "conversion";
    constexpr const char *MARKER_ID = "id";
    constexpr const char *MARKER_STAGE = "stage";
    enum MarkerStage : uint8_t
    {
        MIGRATING = 1, // entries written and read back; staging may be gone, the RD_DIS lock may still be due
        MIGRATED = 2,  // done, lock included where the build has it
        FAILED = 3,
    };

    bool readMarker(uint32_t &id, uint8_t &stage)
    {
        nvs_handle_t handle;
        if (nvs_open(MARKER_NAMESPACE, NVS_READONLY, &handle) != ESP_OK)
        {
            return false;
        }
        const bool ok = nvs_get_u32(handle, MARKER_ID, &id) == ESP_OK && nvs_get_u8(handle, MARKER_STAGE, &stage) == ESP_OK;
        nvs_close(handle);
        return ok;
    }

    bool writeMarker(uint32_t id, uint8_t stage)
    {
        nvs_handle_t handle;
        if (nvs_open(MARKER_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK)
        {
            return false;
        }
        const bool ok = nvs_set_u32(handle, MARKER_ID, id) == ESP_OK && nvs_set_u8(handle, MARKER_STAGE, stage) == ESP_OK &&
                        nvs_commit(handle) == ESP_OK;
        nvs_close(handle);
        return ok;
    }

    // The staged NVS backup, complete and unchanged, decoded.
    bool loadBackup(std::vector<NvsBackup::Entry> &entries)
    {
        Staging::NvsRecord record;
        if (!StagingFlash::readNvsRecord(record))
        {
            return false;
        }
        std::unique_ptr<uint8_t[]> data(new (std::nothrow) uint8_t[record.length]);
        Staging::Digest digest{};
        size_t length = 0;
        return data && StagingFlash::read(Staging::NVS_OFFSET, data.get(), record.length) &&
               psa_crypto_init() == PSA_SUCCESS &&
               psa_hash_compute(PSA_ALG_SHA_256, data.get(), record.length, digest.data(), digest.size(), &length) ==
                   PSA_SUCCESS &&
               digest == record.sha256 && NvsBackup::decode(data.get(), record.length, entries);
    }

    // Release secure builds only: the last step of a conversion. Requires the NVS HMAC key in KEY4 to be read-protected
    // already, so the lock never freezes RD_DIS in an incomplete state.
    void lockRdDisIfDue(uint32_t id)
    {
        if (!ConversionBuild::rdDisLock())
        {
            writeMarker(id, MIGRATED);
            return;
        }
        if (!ConversionEfuse::nvsKeyReadProtected())
        {
            logger.error("NVS key not read-protected; RD_DIS stays open");
            return; // stays MIGRATING: tried again on the next boot
        }
        if (ConversionEfuse::lockRdDis())
        {
            writeMarker(id, MIGRATED);
        }
        else
        {
            logger.error("Could not lock RD_DIS");
        }
    }

    // Step 8. Returns the result of the encrypted NVS init.
    esp_err_t migrate(const Staging::Header &header)
    {
        logger.warn("Conversion pending: migrating settings into encrypted NVS");
        std::vector<NvsBackup::Entry> entries;
        if (!loadBackup(entries))
        {
            // Nothing is erased: the plain NVS and the staging region stay for whoever recovers the reader.
            logger.error("Staged settings are incomplete; NVS left untouched");
            return ESP_ERR_INVALID_STATE;
        }
        // The plain app's NVS cannot be read as encrypted NVS. Its content is safe in the verified backup.
        nvs_flash_erase();
        esp_err_t err = nvs_flash_init();
        if (err != ESP_OK)
        {
            logger.errorf("Encrypted NVS init failed: %s", esp_err_to_name(err));
            return err;
        }
        if (!NvsBackupStore::restore(entries) || !NvsBackupStore::matches(entries) ||
            !writeMarker(header.conversionId, MIGRATING))
        {
            // The staging region stays; the next boot starts over from the backup.
            logger.error("Migrated settings did not read back; keeping the staged copy");
            writeMarker(header.conversionId, FAILED);
            return err;
        }
        if (!StagingFlash::wipe())
        {
            logger.error("Could not erase the staging region");
            return err;
        }
        logger.info("Settings migrated; staging region erased");
        lockRdDisIfDue(header.conversionId);
        return err;
    }
}

namespace ConversionMigration
{
    bool nvsErasePermitted()
    {
        return !StagingFlash::pending();
    }

    int32_t initNvs()
    {
        Staging::Header header;
        if (ConversionBuild::migration() && StagingFlash::readHeader(header))
        {
            return migrate(header);
        }
        esp_err_t err = nvs_flash_init();
        if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND)
        {
            if (!nvsErasePermitted())
            {
                logger.error("NVS needs an erase, but a conversion's data is staged; leaving NVS as it is");
                return err;
            }
            nvs_flash_erase();
            err = nvs_flash_init();
        }
        uint32_t id = 0;
        uint8_t stage = 0;
        // A power cut between the staging erase and the RD_DIS lock: finish the lock now.
        if (err == ESP_OK && ConversionBuild::migration() && readMarker(id, stage) && stage == MIGRATING)
        {
            lockRdDisIfDue(id);
        }
        return err;
    }

    std::string statusMessage()
    {
        uint32_t id = 0;
        uint8_t stage = 0;
        if (!ConversionBuild::migration() || !readMarker(id, stage))
        {
            return "";
        }
        ConversionMessages::Status status;
        status.id = id;
        status.stage = stage == FAILED ? ConversionMessages::STAGE_MIGRATION_FAILED : ConversionMessages::STAGE_MIGRATED;
        status.hasRdDis = true;
        status.rdDisLocked = ConversionEfuse::rdDisLocked();
        return ConversionMessages::status(status);
    }
}

#else // host builds

namespace ConversionMigration
{
    int32_t initNvs() { return 0; }
    bool nvsErasePermitted() { return true; }
    std::string statusMessage() { return ""; }
}

#endif
