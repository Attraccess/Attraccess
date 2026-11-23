#include "conversion_efuse.hpp"

#include "conversion_build.hpp"

#if defined(ESP_PLATFORM) && (defined(ATTRACTAP_CONVERSION_CLIENT) || defined(ATTRACTAP_SECURE_BUILD))

#include <cstring>

#include "../security/efuse_snapshot.hpp"
#include "esp_chip_info.h"
#include "esp_efuse.h"
#include "esp_efuse_table.h"
#include "esp_flash.h"
#include "esp_heap_caps.h"
#include "psa/crypto.h"

namespace
{
    constexpr uint32_t PARTITION_TABLE_OFFSET = 0x8000;
    // ESP_PARTITION_TABLE_MAX_LEN: the table as gen_esp32part writes it (0xFF padded), what secure_packaging.py hashes.
    constexpr size_t PARTITION_TABLE_BYTES = 0xC00;

    esp_efuse_block_t keyBlock(int index)
    {
        return static_cast<esp_efuse_block_t>(EFUSE_BLK_KEY0 + index);
    }

    std::string partitionTableSha256()
    {
        uint8_t table[PARTITION_TABLE_BYTES];
        uint8_t digest[32];
        size_t length = 0;
        if (esp_flash_read(nullptr, table, PARTITION_TABLE_OFFSET, sizeof(table)) != ESP_OK ||
            psa_crypto_init() != PSA_SUCCESS ||
            psa_hash_compute(PSA_ALG_SHA_256, table, sizeof(table), digest, sizeof(digest), &length) != PSA_SUCCESS)
        {
            return "";
        }
        return Staging::hex(digest, sizeof(digest));
    }
}

namespace ConversionEfuse
{
    ConversionMessages::PreflightFacts preflightFacts()
    {
        const EfuseReport::Snapshot snapshot = EfuseSnapshot::read();
        ConversionMessages::PreflightFacts facts;
        esp_chip_info_t chip;
        esp_chip_info(&chip);
        facts.chip = chip.model == CHIP_ESP32S3 ? "esp32s3" : "other";
        facts.chipRevision = chip.revision;
        uint32_t flashSize = 0;
        esp_flash_get_size(nullptr, &flashSize);
        facts.flashSize = flashSize;
        facts.mac = snapshot.mac;
        facts.partitionTableSha256 = partitionTableSha256();
        for (int i = 0; i < 6; i++)
        {
            facts.keys[i].purpose = snapshot.keys[i].purpose;
            facts.keys[i].used = snapshot.keys[i].used;
            facts.keys[i].readProtected = snapshot.keys[i].readProtected;
            facts.keys[i].writeProtected = esp_efuse_get_key_dis_write(keyBlock(i));
        }
        facts.secureBootEn = snapshot.secureBootEn;
        facts.cryptCnt = snapshot.cryptCnt;
        facts.disDownloadManualEncrypt = snapshot.disDownloadManualEncrypt;
        facts.jtagPadDisabled = snapshot.jtagPadDisabled;
        facts.jtagUsbDisabled = snapshot.jtagUsbDisabled;
        facts.heapFree = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
        facts.heapLargest = heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL);
        return facts;
    }

    std::string ownMac()
    {
        return EfuseSnapshot::read().mac;
    }

    ConversionMessages::KeySlot keySlot(int index)
    {
        ConversionMessages::KeySlot slot;
        const esp_efuse_block_t block = keyBlock(index);
        slot.unused = esp_efuse_key_block_unused(block);
        const esp_efuse_purpose_t expected =
            index == 0 ? ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST0 : ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST1;
        slot.digestPurpose = esp_efuse_get_key_purpose(block) == expected;
        // A Secure Boot digest is public; only such a block is ever read.
        if (slot.digestPurpose && !esp_efuse_get_key_dis_read(block))
        {
            esp_efuse_read_block(block, slot.value.data(), 0, 256);
        }
        return slot;
    }

    const char *keyPurposeName(int index)
    {
        return EfuseSnapshot::purposeName(static_cast<int>(esp_efuse_get_key_purpose(keyBlock(index))));
    }

    bool burnDigests(const Staging::Digest &digest0, const Staging::Digest &digest1)
    {
#if defined(ATTRACTAP_CONVERSION_CLIENT) && !defined(ATTRACTAP_CONVERSION_STOP_BEFORE_BURN)
        // One batch: both keys and purposes are programmed together, or (on an error before the commit) neither.
        esp_efuse_batch_write_begin();
        if (esp_efuse_write_key(EFUSE_BLK_KEY0, ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST0, digest0.data(), 32) !=
                ESP_OK ||
            esp_efuse_write_key(EFUSE_BLK_KEY1, ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST1, digest1.data(), 32) !=
                ESP_OK)
        {
            esp_efuse_batch_write_cancel();
            return false;
        }
        return esp_efuse_batch_write_commit() == ESP_OK;
#else
        // Secure apps never burn digests, stop-before-burn builds never burn anything.
        (void)digest0;
        (void)digest1;
        return false;
#endif
    }

    bool rdDisLocked()
    {
        return esp_efuse_read_field_bit(ESP_EFUSE_WR_DIS_RD_DIS);
    }

    bool nvsKeyReadProtected()
    {
        const esp_efuse_block_t block = keyBlock(4);
        return esp_efuse_get_key_purpose(block) == ESP_EFUSE_KEY_PURPOSE_HMAC_UP && !esp_efuse_key_block_unused(block) &&
               esp_efuse_get_key_dis_read(block);
    }

    bool lockRdDis()
    {
#if defined(ATTRACTAP_RD_DIS_LOCK)
        if (rdDisLocked())
        {
            return true; // idempotent: never burned twice
        }
        return esp_efuse_write_field_bit(ESP_EFUSE_WR_DIS_RD_DIS) == ESP_OK && rdDisLocked();
#else
        return false;
#endif
    }
}

#else // host, demo, bridge and plain builds without a conversion client

namespace ConversionEfuse
{
    ConversionMessages::PreflightFacts preflightFacts() { return {}; }
    std::string ownMac() { return ""; }
    ConversionMessages::KeySlot keySlot(int) { return {}; }
    const char *keyPurposeName(int) { return "USER"; }
    bool burnDigests(const Staging::Digest &, const Staging::Digest &) { return false; }
    bool rdDisLocked() { return false; }
    bool nvsKeyReadProtected() { return false; }
    bool lockRdDis() { return false; }
}

#endif
