#pragma once

#include <cstdint>
#include <string>

// The eFuse report a secure-profile reader sends in every session (ATT-1207). The server decides
// from it whether the reader counts as "secured". The report never contains key material: only
// which block holds which purpose, whether it is used / read-protected, and the two public Secure
// Boot digests. Pure code; reading the eFuses lives in efuse_snapshot.cpp.
namespace EfuseReport
{
    constexpr size_t KEY_BLOCKS = 6;
    // The message stays far below the 4 KiB bound the session tolerates for control messages.
    constexpr size_t MAX_BYTES = 4096;

    struct KeyBlock
    {
        std::string purpose; // ESP-IDF purpose name, e.g. "XTS_AES_128_KEY"; "USER" when unused
        bool used = false;
        bool readProtected = false;
    };

    struct Snapshot
    {
        std::string mac; // aa:bb:cc:dd:ee:ff
        bool secureBootEn = false;
        KeyBlock keys[KEY_BLOCKS];
        std::string digest0; // 64 hex characters, empty when KEY0/KEY1 is no Secure Boot digest
        std::string digest1;
        bool revoke[3] = {false, false, false};
        uint32_t cryptCnt = 0;
        bool cryptCntWriteProtected = false;
        bool disDownloadManualEncrypt = false;
        bool jtagPadDisabled = false;
        bool jtagUsbDisabled = false;
        uint32_t softDisJtag = 0;
        bool disDownloadMode = false;
        bool enableSecurityDownload = false;
        bool disForceDownload = false;
        bool disUsbSerialJtagDownload = false;
        uint32_t rdDis = 0;
        bool rdDisWriteProtected = false;
        uint32_t secureVersion = 0;
        std::string flashEncryptionMode = "disabled"; // disabled | development | release
    };

    // The `efuse.report` control message. False when it would exceed MAX_BYTES.
    bool toJson(const Snapshot &snapshot, std::string &out);
    std::string hex(const uint8_t *data, size_t length);
}
