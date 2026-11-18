#include "efuse_snapshot.hpp"

#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)

#include <cstdio>

#include "esp_efuse.h"
#include "esp_efuse_table.h"
#include "esp_flash_encrypt.h"
#include "esp_mac.h"

namespace
{
    bool bit(const esp_efuse_desc_t *field[])
    {
        return esp_efuse_read_field_bit(field);
    }

    uint32_t value(const esp_efuse_desc_t *field[], size_t bits)
    {
        uint32_t out = 0;
        esp_efuse_read_field_blob(field, &out, bits);
        return out;
    }

    std::string digestOf(esp_efuse_block_t block)
    {
        uint8_t digest[32] = {};
        if (esp_efuse_get_key_dis_read(block) || esp_efuse_read_block(block, digest, 0, 256) != ESP_OK)
        {
            return "";
        }
        return EfuseReport::hex(digest, sizeof(digest));
    }

    bool isDigestPurpose(int purpose)
    {
        return purpose == ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST0 || purpose == ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST1 ||
               purpose == ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST2;
    }
}

namespace EfuseSnapshot
{
    const char *purposeName(int purpose)
    {
        switch (purpose)
        {
        case ESP_EFUSE_KEY_PURPOSE_XTS_AES_256_KEY_1:
            return "XTS_AES_256_KEY_1";
        case ESP_EFUSE_KEY_PURPOSE_XTS_AES_256_KEY_2:
            return "XTS_AES_256_KEY_2";
        case ESP_EFUSE_KEY_PURPOSE_XTS_AES_128_KEY:
            return "XTS_AES_128_KEY";
        case ESP_EFUSE_KEY_PURPOSE_HMAC_DOWN_ALL:
            return "HMAC_DOWN_ALL";
        case ESP_EFUSE_KEY_PURPOSE_HMAC_DOWN_JTAG:
            return "HMAC_DOWN_JTAG";
        case ESP_EFUSE_KEY_PURPOSE_HMAC_DOWN_DIGITAL_SIGNATURE:
            return "HMAC_DOWN_DIGITAL_SIGNATURE";
        case ESP_EFUSE_KEY_PURPOSE_HMAC_UP:
            return "HMAC_UP";
        case ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST0:
            return "SECURE_BOOT_DIGEST0";
        case ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST1:
            return "SECURE_BOOT_DIGEST1";
        case ESP_EFUSE_KEY_PURPOSE_SECURE_BOOT_DIGEST2:
            return "SECURE_BOOT_DIGEST2";
        case ESP_EFUSE_KEY_PURPOSE_USER:
        default:
            return "USER";
        }
    }

    EfuseReport::Snapshot read()
    {
        EfuseReport::Snapshot s;
        uint8_t mac[6] = {};
        esp_efuse_mac_get_default(mac);
        char text[18];
        snprintf(text, sizeof(text), "%02x:%02x:%02x:%02x:%02x:%02x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
        s.mac = text;
        s.secureBootEn = bit(ESP_EFUSE_SECURE_BOOT_EN);
        int purposes[EfuseReport::KEY_BLOCKS];
        for (size_t i = 0; i < EfuseReport::KEY_BLOCKS; i++)
        {
            const esp_efuse_block_t block = static_cast<esp_efuse_block_t>(EFUSE_BLK_KEY0 + i);
            purposes[i] = static_cast<int>(esp_efuse_get_key_purpose(block));
            s.keys[i].purpose = purposeName(purposes[i]);
            s.keys[i].used = !esp_efuse_key_block_unused(block);
            s.keys[i].readProtected = esp_efuse_get_key_dis_read(block);
        }
        // Only the public Secure Boot digests are ever read.
        if (isDigestPurpose(purposes[0]))
        {
            s.digest0 = digestOf(EFUSE_BLK_KEY0);
        }
        if (isDigestPurpose(purposes[1]))
        {
            s.digest1 = digestOf(EFUSE_BLK_KEY1);
        }
        s.revoke[0] = esp_efuse_get_digest_revoke(0);
        s.revoke[1] = esp_efuse_get_digest_revoke(1);
        s.revoke[2] = esp_efuse_get_digest_revoke(2);
        s.cryptCnt = value(ESP_EFUSE_SPI_BOOT_CRYPT_CNT, 3);
        s.cryptCntWriteProtected = bit(ESP_EFUSE_WR_DIS_SPI_BOOT_CRYPT_CNT);
        s.disDownloadManualEncrypt = bit(ESP_EFUSE_DIS_DOWNLOAD_MANUAL_ENCRYPT);
        s.jtagPadDisabled = bit(ESP_EFUSE_DIS_PAD_JTAG);
        s.jtagUsbDisabled = bit(ESP_EFUSE_DIS_USB_JTAG);
        s.softDisJtag = value(ESP_EFUSE_SOFT_DIS_JTAG, 3);
        s.disDownloadMode = bit(ESP_EFUSE_DIS_DOWNLOAD_MODE);
        s.enableSecurityDownload = bit(ESP_EFUSE_ENABLE_SECURITY_DOWNLOAD);
        s.disForceDownload = bit(ESP_EFUSE_DIS_FORCE_DOWNLOAD);
        s.disUsbSerialJtagDownload = bit(ESP_EFUSE_DIS_USB_SERIAL_JTAG_DOWNLOAD_MODE);
        s.rdDis = value(ESP_EFUSE_RD_DIS, 7);
        s.rdDisWriteProtected = bit(ESP_EFUSE_WR_DIS_RD_DIS);
        // SECURE_VERSION is thermometer coded: the number of set bits is the version.
        size_t secureVersion = 0;
        esp_efuse_read_field_cnt(ESP_EFUSE_SECURE_VERSION, &secureVersion);
        s.secureVersion = static_cast<uint32_t>(secureVersion);
        switch (esp_get_flash_encryption_mode())
        {
        case ESP_FLASH_ENC_MODE_RELEASE:
            s.flashEncryptionMode = "release";
            break;
        case ESP_FLASH_ENC_MODE_DEVELOPMENT:
            s.flashEncryptionMode = "development";
            break;
        default:
            s.flashEncryptionMode = "disabled";
            break;
        }
        return s;
    }
}
#endif
