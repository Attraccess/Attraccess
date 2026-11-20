#include "efuse_report.hpp"

#include <ArduinoJson.h>

namespace EfuseReport
{
    std::string hex(const uint8_t *data, size_t length)
    {
        static const char DIGITS[] = "0123456789abcdef";
        std::string out;
        out.reserve(length * 2);
        for (size_t i = 0; i < length; i++)
        {
            out.push_back(DIGITS[data[i] >> 4]);
            out.push_back(DIGITS[data[i] & 15]);
        }
        return out;
    }

    bool toJson(const Snapshot &s, std::string &out)
    {
        JsonDocument doc;
        doc["t"] = "efuse.report";
        doc["mac"] = s.mac;
        doc["secureBootEn"] = s.secureBootEn;
        JsonArray keys = doc["keys"].to<JsonArray>();
        for (const KeyBlock &block : s.keys)
        {
            JsonObject key = keys.add<JsonObject>();
            key["purpose"] = block.purpose;
            key["used"] = block.used;
            key["readProtected"] = block.readProtected;
        }
        if (s.digest0.empty())
        {
            doc["digest0"] = nullptr;
        }
        else
        {
            doc["digest0"] = s.digest0;
        }
        if (s.digest1.empty())
        {
            doc["digest1"] = nullptr;
        }
        else
        {
            doc["digest1"] = s.digest1;
        }
        JsonArray revoke = doc["revoke"].to<JsonArray>();
        for (bool bit : s.revoke)
        {
            revoke.add(bit);
        }
        doc["cryptCnt"] = s.cryptCnt;
        doc["cryptCntWriteProtected"] = s.cryptCntWriteProtected;
        doc["disDownloadManualEncrypt"] = s.disDownloadManualEncrypt;
        JsonObject jtag = doc["jtag"].to<JsonObject>();
        jtag["padDisabled"] = s.jtagPadDisabled;
        jtag["usbDisabled"] = s.jtagUsbDisabled;
        jtag["softDisJtag"] = s.softDisJtag;
        JsonObject download = doc["download"].to<JsonObject>();
        download["disDownloadMode"] = s.disDownloadMode;
        download["enableSecurityDownload"] = s.enableSecurityDownload;
        download["disForceDownload"] = s.disForceDownload;
        download["disUsbSerialJtagDownload"] = s.disUsbSerialJtagDownload;
        doc["rdDis"] = s.rdDis;
        doc["rdDisWriteProtected"] = s.rdDisWriteProtected;
        doc["secureVersion"] = s.secureVersion;
        doc["flashEncryptionMode"] = s.flashEncryptionMode;
        if (doc.overflowed())
        {
            return false;
        }
        out.clear();
        serializeJson(doc, out);
        return out.size() < MAX_BYTES;
    }
}
