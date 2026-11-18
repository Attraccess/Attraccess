#include "ds_console.hpp"

#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_LAB)

#include <algorithm>
#include <cstdio>

#include "ds_creator.hpp"
#include "ds_reader_key.hpp"
#include "ds_storage.hpp"
#include "efuse_snapshot.hpp"
#include "esp_efuse.h"
#include "esp_mac.h"
#include "esp_task_wdt.h"
#include "pairing_codec.hpp"

namespace
{
    // The one lab reader the KEY3 burn is approved for (ATT-1207). Any other chip refuses, even when its own MAC is typed.
    constexpr const char *APPROVED_MAC = "dc:b4:d9:21:71:c8";

    std::string ownMac()
    {
        uint8_t mac[6] = {};
        esp_efuse_mac_get_default(mac);
        char text[18];
        snprintf(text, sizeof(text), "%02x:%02x:%02x:%02x:%02x:%02x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
        return text;
    }

    std::string trimmed(std::string text)
    {
        const char *space = " \t\r\n\"";
        text.erase(0, text.find_first_not_of(space));
        text.erase(text.find_last_not_of(space) + 1);
        return text;
    }

    void status()
    {
        DsRecord::Record record;
        const bool hasRecord = DsStorage::read(record);
        const bool dsAvailable = DsReaderKeyStore::status() == DsReaderKeyStore::Status::Available;
        const int purpose = static_cast<int>(esp_efuse_get_key_purpose(EFUSE_BLK_KEY3));
        const bool unused = esp_efuse_key_block_unused(EFUSE_BLK_KEY3) && purpose == 0;
        const char *flash = "disabled";
        const EfuseReport::Snapshot snapshot = EfuseSnapshot::read();
        flash = snapshot.flashEncryptionMode.c_str();
        const char *block3 = unused ? "unused" : EfuseSnapshot::purposeName(purpose);
        printf("DS_STATUS available=%d record=%d key3=%s fe=%s\n", dsAvailable ? 1 : 0, hasRecord ? 1 : 0, block3, flash);
    }

    void create(const std::string &argument)
    {
        std::string requested = trimmed(argument);
        std::transform(requested.begin(), requested.end(), requested.begin(),
                       [](unsigned char c) { return static_cast<char>(tolower(c)); });
        if (requested != ownMac() || requested != APPROVED_MAC)
        {
            printf("DS_CREATE_RESULT error mac-mismatch\n");
            return;
        }
        // RSA-3072 key generation takes longer than the task watchdog allows; this task is off the watchdog meanwhile.
        esp_task_wdt_delete(NULL);
        const DsCreator::Result result = DsCreator::create();
        esp_task_wdt_add(NULL);
        // Tells the lab tool whether KEY3 may be burned even though creation failed (never retry then).
        printf("DS_CREATE_BURNED %d\n", result.burned ? 1 : 0);
        if (result.ok)
        {
            printf("DS_CREATE_RESULT ok\n");
        }
        else
        {
            printf("DS_CREATE_RESULT error %s\n", result.code.c_str());
        }
    }

    void exportRecord()
    {
        std::vector<uint8_t> raw;
        if (!DsStorage::readRaw(raw))
        {
            printf("DS_RECORD_ERROR no-record\n");
            return;
        }
        printf("DS_RECORD_BEGIN\n%s\nDS_RECORD_END\n", PairingCodec::base64Encode(raw).c_str());
    }
}

namespace DsConsole
{
    bool handle(const std::string &topic, const std::string &argument)
    {
        if (topic == "ds.status")
        {
            status();
        }
        else if (topic == "ds.create")
        {
            create(argument);
        }
        else if (topic == "ds.export")
        {
            exportRecord();
        }
        else
        {
            return false;
        }
        return true;
    }
}
#endif
