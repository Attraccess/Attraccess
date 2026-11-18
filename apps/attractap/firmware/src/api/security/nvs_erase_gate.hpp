#pragma once

// Decides whether start-up may erase the whole NVS partition (main.cpp). Host-testable: it knows
// nothing about ESP-IDF error codes; main.cpp maps nvs_flash_init()'s result to NvsInitResult.
//
//  - Plain builds: unchanged. Erase on NO_FREE_PAGES / NEW_VERSION_FOUND, nothing else.
//  - Secure builds: the NVS is encrypted with the eFuse HMAC key and may hold data a pending
//    conversion needs (the staging area, see migration_pending.hpp). Erase on the same two codes
//    only while no migration is pending; never on an encryption/HMAC key error (those say "the key
//    or the partition is not what we expect", and erasing would only hide that).
namespace NvsEraseGate
{
    enum class NvsInitResult
    {
        Ok,
        NoFreePages,
        NewVersionFound,
        // Encryption or HMAC key errors and anything else nvs_flash_init() can return.
        OtherError,
    };

    // Whether nvs_flash_init() succeeded this boot (set by main.cpp). On a secure build a failed init
    // never erases; DS creation and the identity upgrade refuse to run until the next boot.
    inline bool &initialized()
    {
        static bool ok = false;
        return ok;
    }

    inline bool shouldErase(NvsInitResult result, bool secureBuild, bool migrationPending)
    {
        const bool eraseable = result == NvsInitResult::NoFreePages || result == NvsInitResult::NewVersionFound;
        if (!eraseable)
        {
            return false;
        }
        return !secureBuild || !migrationPending;
    }
}
