#include "reader_link.hpp"

#include "build_profile.hpp"
#include "efuse_report.hpp"
#include "efuse_snapshot.hpp"

// The eFuse report (ATT-1207): a secure-profile reader tells the server which eFuses it has, once per session,
// as a CONTROL frame (`efuse.report`). Read-only: nothing in the firmware writes an eFuse.

#if defined(ESP_PLATFORM) && defined(ATTRACTAP_SECURE_BUILD)

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
    sendEfuseReport();
}

void ReaderLink::sendEfuseReport()
{
    if (efuseReportSent)
    {
        return;
    }
    efuseReportSent = true;
    std::string json;
    if (!EfuseReport::toJson(EfuseSnapshot::read(), json))
    {
        logger.error("eFuse report too large");
        return;
    }
    sendControl(json);
}

#else // plain builds and host tests: nothing to report

bool ReaderLink::sendControl(const std::string &)
{
    return false;
}
void ReaderLink::onFirmwareInfoSent() {}
void ReaderLink::sendEfuseReport() {}

#endif
