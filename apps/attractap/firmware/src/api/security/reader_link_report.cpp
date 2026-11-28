#include "reader_link.hpp"

#include "build_profile.hpp"
#include "efuse_report.hpp"
#include "efuse_snapshot.hpp"
#include "../conversion/conversion_link.hpp"
#include "../../platform.hpp"

// What a reader reports once per session on the CONTROL channel, right after READER_FIRMWARE_INFO:
//  1. `conversion.status` (ATT-1208): the plain app's staged conversion, or the secure app's migration outcome.
//  2. `efuse.report` (ATT-1207, secure builds): which eFuses the chip has. Reading them changes nothing. The firmware
//     writes exactly two eFuse fields, both only during a conversion (src/api/conversion/conversion_efuse.cpp): the
//     step-4 digest burn (KEY0/KEY1) in the plain app and the WR_DIS_RD_DIS lock in the release secure app.
// The status goes first: the server handles one session's control messages in order.

#if defined(ESP_PLATFORM)

bool ReaderLink::sendControl(const std::string &json)
{
    if (!sessionReady.load())
    {
        return false;
    }
    std::lock_guard<std::mutex> lock(sessionMutex);
    return sendSessionFrameLocked(SessionFraming::FrameType::CONTROL, reinterpret_cast<const uint8_t *>(json.data()),
                                  json.size());
}

void ReaderLink::onFirmwareInfoSent()
{
    if (channel != Channel::Session || !sessionReady.load())
    {
        return;
    }
    efuseReportDue = true;
    sendEfuseReport();
}

void ReaderLink::sendEfuseReport()
{
    if (!conversionStatusSent)
    {
        const std::string status = ConversionLink::statusMessage();
        // Refused under back-pressure: loop() tries again, and the eFuse report waits behind it.
        conversionStatusSent = status.empty() || sendControl(status);
        if (!conversionStatusSent)
        {
            efuseRetryAt = millis() + EFUSE_RETRY_MS;
            return;
        }
    }
#if defined(ATTRACTAP_SECURE_BUILD)
    if (efuseReportSent)
    {
        return;
    }
    std::string json;
    if (!EfuseReport::toJson(EfuseSnapshot::read(), json))
    {
        efuseReportSent = true;
        logger.error("eFuse report too large");
        return;
    }
    // Refused under back-pressure: loop() tries again.
    efuseReportSent = sendControl(json);
    if (!efuseReportSent) efuseRetryAt = millis() + EFUSE_RETRY_MS;
#else
    efuseReportSent = true; // plain builds have no eFuse report
#endif
}

#else // host builds: nothing to report

bool ReaderLink::sendControl(const std::string &)
{
    return false;
}
void ReaderLink::onFirmwareInfoSent() {}
void ReaderLink::sendEfuseReport() {}

#endif
