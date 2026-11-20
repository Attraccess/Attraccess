// The `efuse.report` control message: exact field names the server parses (ATT-1207), no key material, and the
// size bound. Reading the eFuses (efuse_snapshot.cpp) is device-only and covered by the hardware tests.
// golden-efuse-report.json is the contract with the server: this test pins the bytes a fully secured reader
// sends, and apps/api/src/attractap/security/efuse-report.spec.ts parses the same file and expects no problems.
#include <ArduinoJson.h>

#include <fstream>
#include <iostream>
#include <sstream>
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

// Same digests as the server's test fixture (apps/api/src/attractap/security/testing/efuse-report.test-fixture.ts).
static const char *DIGEST0 = "fd0e62812a67e20c36a85321733343e8ebd420e2d7940bbfd49ac9e1c502b29d";
static const char *DIGEST1 = "65c97f279aa20b82d134fd6cc0eeb39d51e42a50d9c3d771f25b42e6487fafd9";

// A reader that passes every server check: both signing keys enrolled, slot 2 revoked, release flash
// encryption, XTS and NVS HMAC keys read-protected, JTAG off, ROM download in security mode.
static EfuseReport::Snapshot securedSnapshot()
{
    EfuseReport::Snapshot s;
    s.mac = "dc:b4:d9:21:71:c8";
    s.secureBootEn = true;
    s.keys[0] = {"SECURE_BOOT_DIGEST0", true, false};
    s.keys[1] = {"SECURE_BOOT_DIGEST1", true, false};
    s.keys[2] = {"XTS_AES_128_KEY", true, true};
    s.keys[3] = {"USER", false, false};
    s.keys[4] = {"HMAC_UP", true, true};
    s.keys[5] = {"USER", false, false};
    s.digest0 = DIGEST0;
    s.digest1 = DIGEST1;
    s.revoke[2] = true;
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

static std::string readGolden()
{
    std::ifstream file(EFUSE_GOLDEN_JSON, std::ios::binary);
    std::stringstream content;
    content << file.rdbuf();
    std::string text = content.str();
    // The file ends with a newline (editorconfig); the wire message does not.
    if (!text.empty() && text.back() == '\n')
        text.pop_back();
    return text;
}

int main()
{
    std::string json;
    CHECK(EfuseReport::toJson(securedSnapshot(), json), "serializes");
    CHECK(json.size() < EfuseReport::MAX_BYTES, "within the size bound");
    const std::string golden = readGolden();
    CHECK(!golden.empty(), std::string("golden file readable: ") + EFUSE_GOLDEN_JSON);
    CHECK(json == golden, "secured report equals golden-efuse-report.json byte for byte\n  actual: " + json);

    JsonDocument doc;
    CHECK(!deserializeJson(doc, json), "parses back");
    CHECK(doc["t"] == "efuse.report", "message type");
    CHECK(doc["mac"] == "dc:b4:d9:21:71:c8" && doc["secureBootEn"] == true, "mac and secure boot");
    CHECK(doc["keys"].size() == EfuseReport::KEY_BLOCKS, "six key blocks");
    CHECK(doc["keys"][0]["purpose"] == "SECURE_BOOT_DIGEST0" && doc["keys"][0]["used"] == true &&
              doc["keys"][0]["readProtected"] == false,
          "digest block");
    CHECK(doc["keys"][1]["purpose"] == "SECURE_BOOT_DIGEST1" && doc["keys"][1]["used"] == true, "second digest block");
    CHECK(doc["keys"][4]["purpose"] == "HMAC_UP" && doc["keys"][4]["readProtected"] == true, "NVS key block");
    CHECK(doc["digest0"] == DIGEST0 && doc["digest1"] == DIGEST1, "digests");
    CHECK(doc["revoke"].size() == 3 && doc["revoke"][0] == false && doc["revoke"][1] == false &&
              doc["revoke"][2] == true,
          "revoke bits");
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
    CHECK(back["flashEncryptionMode"] == "disabled" && back["secureBootEn"] == false && back["digest0"].isNull() &&
              back["digest1"].isNull(),
          "defaults (digests null when absent)");

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
