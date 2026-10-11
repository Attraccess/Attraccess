#pragma once

#include <cstdint>

// Local wall-clock time for the display.
//
// UTC is the system clock, kept by SNTP. Until SNTP has synced (for example
// when a firewall blocks NTP), the API's server time sets the system clock
// instead. The local offset always comes from the API, i.e. the server's
// timezone, matching how session start times are already shown.
namespace WallClock
{
    struct LocalTime
    {
        bool valid = false;
        int year = 0;
        int month = 0;   // 1-12
        int day = 0;     // 1-31
        int weekday = 0; // 0 = Sunday
        int hour = 0;
        int minute = 0;
    };

    void onSntpSynced();
    // Network UTC must be in [2025-01-01, 2100-01-01), with an offset in
    // [-840, 840] minutes. Rejected samples leave UTC and offset unchanged.
    void onServerTime(int64_t epochMs, int32_t utcOffsetMinutes);
    // Offline demo setup trusts the preset system timeline, including old dates.
    void onDemoTime(int32_t utcOffsetMinutes);
    LocalTime now();
}
