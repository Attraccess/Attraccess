#pragma once

#include <cstdint>

// esp_reset_reason_t as text, shared by READER_CRASH_REPORT, READER_FIRMWARE_INFO and the boot log
// (ESP builds only; defined in crash-report.cpp).
const char *crashResetReasonToString(uint8_t reason);
