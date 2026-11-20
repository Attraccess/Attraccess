#include "ble_errors.hpp"

#include <cstdio>

namespace ble
{
    namespace
    {
        Error withDetail(Code code, const char *format, int value)
        {
            char detail[sizeof(Error::detail)];
            std::snprintf(detail, sizeof detail, format, value);
            return Error(code, detail);
        }

        bool inRange(int status, int base) { return status > base && status < base + 0x100; }
    }

    Error mapConnectFailure(int status)
    {
        if (status == nimble::HS_ETIMEOUT) return Error(Code::DeviceNotFound, "connect-timeout");
        if (inRange(status, nimble::ERR_HCI_BASE))
            return withDetail(Code::ConnectionFailed, "hci:0x%02x", status - nimble::ERR_HCI_BASE);
        return withDetail(Code::ConnectionFailed, "nimble:rc=%d", status);
    }

    Error mapGattStatus(int status)
    {
        if (status == 0) return Error();
        if (inRange(status, nimble::ERR_ATT_BASE))
            return withDetail(Code::GattError, "att:0x%02x", status - nimble::ERR_ATT_BASE);
        if (status == nimble::HS_ETIMEOUT || status == nimble::HS_ETIMEOUT_HCI)
            return withDetail(Code::Timeout, "nimble:rc=%d", status);
        if (status == nimble::HS_ENOTCONN) return withDetail(Code::Disconnected, "nimble:rc=%d", status);
        if (inRange(status, nimble::ERR_HCI_BASE))
            return withDetail(Code::Internal, "hci:0x%02x", status - nimble::ERR_HCI_BASE);
        return withDetail(Code::Internal, "nimble:rc=%d", status);
    }

    void disconnectDetail(int reason, char *out, size_t size)
    {
        if (inRange(reason, nimble::ERR_HCI_BASE))
            std::snprintf(out, size, "reason:0x%02x", reason - nimble::ERR_HCI_BASE);
        else
            std::snprintf(out, size, "nimble:rc=%d", reason);
    }
}
