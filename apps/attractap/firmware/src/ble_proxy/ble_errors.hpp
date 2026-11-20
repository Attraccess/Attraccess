#pragma once

// NimBLE status codes -> plugin error codes (ATT-1032 taxonomy), with the raw code as safe detail text.
// The constants mirror NimBLE's ble_hs.h; the NimBLE glue static_asserts that they still match.

#include "ble_types.hpp"

namespace ble
{
    namespace nimble
    {
        constexpr int HS_ENOMEM = 6;
        constexpr int HS_ENOTCONN = 7;
        constexpr int HS_ECONTROLLER = 12;
        constexpr int HS_ETIMEOUT = 13;
        constexpr int HS_EDONE = 14;
        constexpr int HS_ETIMEOUT_HCI = 19;
        constexpr int ERR_ATT_BASE = 0x100;
        constexpr int ERR_HCI_BASE = 0x200;
        constexpr int ERR_L2C_BASE = 0x300;
        // HCI error codes (Bluetooth Core Vol 1 Part F).
        constexpr int HCI_CONN_SPVN_TMO = 0x08;
        constexpr int HCI_CONN_ESTABLISHMENT = 0x3e;
    }

    // A connect that did not establish a link (the GAP connect event status, or ble_gap_connect's rc).
    Error mapConnectFailure(int status);
    // A GATT procedure's status (0 = success).
    Error mapGattStatus(int status);
    // The reason of a disconnect (an HCI reason as NimBLE reports it): `reason:0x<xx>` or `nimble:rc=<n>`.
    void disconnectDetail(int reason, char *out, size_t size);
}
