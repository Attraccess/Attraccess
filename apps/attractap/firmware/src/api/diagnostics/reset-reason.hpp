#pragma once

#include <cstdint>

// esp_reset_reason_t as text, shared by READER_CRASH_REPORT, READER_FIRMWARE_INFO and the boot log
// (ESP builds only; defined in crash-report.cpp).
const char *crashResetReasonToString(uint8_t reason);
// Panic, watchdog and lockup resets: the firmware died and may have written a coredump.
bool crashResetIsCrash(uint8_t reason);
