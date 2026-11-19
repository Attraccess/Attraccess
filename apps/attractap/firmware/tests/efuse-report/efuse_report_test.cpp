// The `efuse.report` control message: exact field names the server parses (ATT-1207), no key material, and the
// size bound. Reading the eFuses (efuse_snapshot.cpp) is device-only and covered by the hardware tests.
#include <ArduinoJson.h>

#include <iostream>
#include <string>

#include "efuse_report.hpp"

static int failures = 0;
#define CHECK(cond, message)                                                                  \
    do                                                                                        \
    {                                                                                         \
        if (!(cond))                                                                          \
        {                                                                                     \
            failures++;                                                                       \
            std::cerr << "FAIL: " << message << " (" << #cond << ")\n";                       \
        }                                                                                     \
    } while (0)

static EfuseReport::Snapshot securedSnapshot()
{
    EfuseReport::Snapshot s;
    s.mac = "dc:b4:d9:21:71:c8";
    s.secureBootEn = true;
    s.keys[0] = {"SECURE_BOOT_DIGEST0", true, false};
    s.keys[1] = {"USER", false, false};
    s.keys[2] = {"XTS_AES_128_KEY", true, true};
    s.keys[3] = {"USER", false, false};
    s.keys[4] = {"HMAC_UP", true, true};
    s.keys[5] = {"USER", false, false};
    s.digest0 = std::string(64, 'a');
    s.cryptCnt = 7;
    s.cryptCntWriteProtected = true;
    s.disDownloadManualEncrypt = true;
    s.jtagPadDisabled = true;
    s.jtagUsbDisabled = true;
    s.softDisJtag = 7;
    s.disDownloadMode = false;
    s.enableSecurityDownload = true;
    s.disForceDownload = true;
    s.disUsbSerialJtagDownload = true;
    s.rdDis = 20;
    s.rdDisWriteProtected = true;
    s.secureVersion = 1;
    s.flashEncryptionMode = "release";
    return s;
}

int main()
{
    std::string json;
    CHECK(EfuseReport::toJson(securedSnapshot(), json), "serializes");
    CHECK(json.size() < EfuseReport::MAX_BYTES, "within the size bound");

    JsonDocument doc;
    CHECK(!deserializeJson(doc, json), "parses back");
    CHECK(doc["t"] == "efuse.report", "message type");
    CHECK(doc["mac"] == "dc:b4:d9:21:71:c8" && doc["secureBootEn"] == true, "mac and secure boot");
    CHECK(doc["keys"].size() == EfuseReport::KEY_BLOCKS, "six key blocks");
    CHECK(doc["keys"][0]["purpose"] == "SECURE_BOOT_DIGEST0" && doc["keys"][0]["used"] == true &&
              doc["keys"][0]["readProtected"] == false,
          "digest block");
    CHECK(doc["keys"][4]["purpose"] == "HMAC_UP" && doc["keys"][4]["readProtected"] == true, "NVS key block");
    CHECK(doc["digest0"] == std::string(64, 'a') && doc["digest1"].isNull(), "digests (null when absent)");
    CHECK(doc["revoke"].size() == 3 && doc["revoke"][0] == false, "revoke bits");
    CHECK(doc["cryptCnt"] == 7 && doc["cryptCntWriteProtected"] == true && doc["disDownloadManualEncrypt"] == true,
          "flash encryption counters");
    CHECK(doc["jtag"]["padDisabled"] == true && doc["jtag"]["usbDisabled"] == true && doc["jtag"]["softDisJtag"] == 7,
          "jtag");
    CHECK(doc["download"]["enableSecurityDownload"] == true && doc["download"]["disForceDownload"] == true &&
              doc["download"]["disDownloadMode"] == false && doc["download"]["disUsbSerialJtagDownload"] == true,
          "download");
    CHECK(doc["rdDis"] == 20 && doc["rdDisWriteProtected"] == true && doc["secureVersion"] == 1, "read protection");
    CHECK(doc["flashEncryptionMode"] == "release", "flash encryption mode");

    // Nothing but the documented top-level fields leaves the reader: no key bytes, no DS fields.
    const char *allowed[] = {"t", "mac", "secureBootEn", "keys", "digest0", "digest1", "revoke", "cryptCnt",
                             "cryptCntWriteProtected", "disDownloadManualEncrypt", "jtag", "download", "rdDis",
                             "rdDisWriteProtected", "secureVersion", "flashEncryptionMode"};
    for (JsonPair field : doc.as<JsonObject>())
    {
        bool known = false;
        for (const char *name : allowed)
            known = known || field.key() == name;
        CHECK(known, std::string("unexpected field ") + field.key().c_str());
    }

    // A plain snapshot (defaults) still serializes, with the safe "disabled" mode.
    EfuseReport::Snapshot empty;
    CHECK(EfuseReport::toJson(empty, json), "default snapshot serializes");
    JsonDocument back;
    deserializeJson(back, json);
    CHECK(back["flashEncryptionMode"] == "disabled" && back["secureBootEn"] == false && back["digest0"].isNull(),
          "defaults");

    const uint8_t bytes[] = {0x00, 0xab, 0xff};
    CHECK(EfuseReport::hex(bytes, 3) == "00abff", "hex");

    if (failures)
    {
        std::cerr << failures << " failure(s)\n";
        return 1;
    }
    std::cout << "efuse-report ok\n";
    return 0;
}
